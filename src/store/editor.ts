import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { COLORS, colorById, type BeadColor, type ColorSetId } from '@/core/colors'
import { BeadGrid, EMPTY } from '@/core/grid'
import { UndoStack, diffSnapshot } from '@/core/history'
import { fitToColorSet, fitToColors, type FitResult } from '@/core/palette'
import { colorUsage, estimateCost } from '@/core/pattern'
import { gridPhysicalInfo } from '@/core/physical'
import { stockReport, type StockMap } from '@/core/stock'
import { IRON_FINISHES, finishById, type IronFinishId } from '@/core/iron'
import { playBeadTick, playChime } from '@/core/sound'
import {
  REST_EVERY_MINUTES as REST_EVERY,
  nextRestIn as restNextIn,
  restMilestone
} from '@/core/session'
import { createProjectFile, parseProjectFile, type ParsedProject } from '@/core/project'
import { renderThumbnail } from '@/renderer/export'
import {
  deleteProject,
  listProjects,
  loadProject,
  requestPersistentStorage,
  saveProject,
  type ProjectSummary
} from '@/storage/db'

export type ToolId =
  | 'pencil'
  | 'eraser'
  | 'bucket'
  | 'eyedropper'
  | 'line'
  | 'rect'
  | 'rectFill'
  | 'ellipse'
  | 'ellipseFill'
  | 'select'

export type Symmetry = 'none' | 'x' | 'y' | 'quad'
export type CanvasStyle = 'bead' | 'flat' | 'chart'

export interface Selection {
  x: number
  y: number
  w: number
  h: number
}

const DEFAULT_SIZE = 48
const AUTO_SAVE_DELAY = 900

/**
 * 编辑器状态中枢。
 *
 * 关键约定：网格数据是 `Uint16Array`，**绝不**放进 ref/reactive（否则会被 Proxy 包住，
 * 十万格每次读写都走拦截器）。用 shallowRef 持有实例 + gridVersion 计数器驱动视图刷新。
 */
export const useEditorStore = defineStore('editor', () => {
  // ---------- 文档 ----------
  const grid = shallowRef<BeadGrid>(new BeadGrid(DEFAULT_SIZE, DEFAULT_SIZE))
  const gridVersion = ref(0)
  const docId = ref<string>(crypto.randomUUID())
  const docName = ref('未命名图纸')
  const createdAt = ref(Date.now())
  const pricePerBead = ref(0.03)
  const lastSavedAt = ref(0)
  const dirty = ref(false)

  // 跟拼进度（同样不放进响应式，用版本号驱动）
  let done: Uint8Array = new Uint8Array(DEFAULT_SIZE * DEFAULT_SIZE)
  const doneVersion = ref(0)

  // ---------- 工具 ----------
  const tool = ref<ToolId>('pencil')
  const colorId = ref<number>(COLORS[0]?.id ?? 1)
  const brushSize = ref(1)
  const symmetry = ref<Symmetry>('none')
  const style = ref<CanvasStyle>('bead')
  const showGrid = ref(true)
  const showNumbers = ref(false)
  /** 是否画 29×29 豆板分块虚线 */
  const showBoards = ref(false)
  /** 烫法：决定画布上画的是圆珠还是熨过的成品 */
  const FINISH_KEY = 'bead:finish'
  const finish = ref<IronFinishId>(loadFinish())
  const finishInfo = computed(() => finishById(finish.value))

  function loadFinish(): IronFinishId {
    try {
      const raw = localStorage.getItem(FINISH_KEY)
      if (raw && IRON_FINISHES.some((f) => f.id === raw)) return raw as IronFinishId
    } catch {
      /* 忽略，用默认 */
    }
    return 'raw'
  }

  function setFinish(id: IronFinishId): void {
    finish.value = id
    try {
      localStorage.setItem(FINISH_KEY, id)
    } catch {
      /* 存不了不影响本次 */
    }
  }

  // 选择区
  const selection = ref<Selection | null>(null)
  let clipboard: Uint16Array | null = null
  let clipboardSize = { w: 0, h: 0 }

  // 跟拼模式
  const guideMode = ref(false)
  const guideColorId = ref<number | null>(null)

  // ---------- 撤销栈 ----------
  const undoStack = new UndoStack(120)
  const historyVersion = ref(0)
  let strokeSnapshot: Uint16Array | null = null

  // ---------- 派生 ----------
  const width = computed(() => grid.value.width)
  const height = computed(() => grid.value.height)
  const usage = computed(() => {
    void gridVersion.value
    return colorUsage(grid.value)
  })
  const total = computed(() => {
    void gridVersion.value
    return grid.value.usedCount()
  })
  const cost = computed(() => estimateCost(total.value, pricePerBead.value))
  /** 成品尺寸、豆板数、打印页数（跟实物有关，不跟颜色用量有关） */
  const physical = computed(() => gridPhysicalInfo(grid.value))

  // ---------- 声音（合成音，不占体积；存在本地，默认开） ----------
  const SOUND_KEY = 'bead:sound'
  const soundOn = ref<boolean>(loadFlag(SOUND_KEY, true))

  function loadFlag(key: string, fallback: boolean): boolean {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? fallback : raw === '1'
    } catch {
      return fallback
    }
  }

  function setSoundOn(on: boolean): void {
    soundOn.value = on
    try {
      localStorage.setItem(SOUND_KEY, on ? '1' : '0')
    } catch {
      /* 存不了就算了 */
    }
  }

  function tick(): void {
    if (soundOn.value) playBeadTick()
  }

  // ---------- 专注计时（这一轮坐下来拼了多久） ----------
  const sessionStart = ref(Date.now())
  const clockTick = ref(Date.now())
  let clockTimer: ReturnType<typeof setInterval> | null = null

  function startClock(): void {
    if (clockTimer) return
    clockTick.value = Date.now()
    // 20 秒刷一次就够：界面上只显示到"分钟"
    clockTimer = setInterval(() => {
      clockTick.value = Date.now()
      checkRest()
    }, 20000)
  }

  function stopClock(): void {
    if (!clockTimer) return
    clearInterval(clockTimer)
    clockTimer = null
  }

  const sessionMinutes = computed(() =>
    Math.max(0, Math.floor((clockTick.value - sessionStart.value) / 60000))
  )

  function resetSession(): void {
    sessionStart.value = Date.now()
    clockTick.value = Date.now()
    restMark = 0
    restDue.value = false
  }

  // ---------- 久坐提醒：坐久了帮你喊一声 ----------
  const SIT_KEY = 'bead:sit'
  const sitReminder = ref(loadFlag(SIT_KEY, true))
  const restDue = ref(false)
  let restMark = 0

  function setSitReminder(on: boolean): void {
    sitReminder.value = on
    if (!on) restDue.value = false
    try {
      localStorage.setItem(SIT_KEY, on ? '1' : '0')
    } catch {
      /* 存不了不影响本次会话 */
    }
  }

  function checkRest(): void {
    if (!sitReminder.value) return
    const mark = restMilestone(sessionMinutes.value, REST_EVERY)
    if (mark > restMark) {
      restMark = mark
      restDue.value = true
    }
  }

  function ackRest(): void {
    restDue.value = false
  }

  /** 距离下次提醒还有几分钟 */
  const nextRestIn = computed(() => {
    if (!sitReminder.value) return 0
    return restNextIn(sessionMinutes.value, REST_EVERY)
  })

  // ---------- 豆子库存（手上有多少颗，用来算还缺什么） ----------
  const STOCK_KEY = 'bead:stock'
  const stock = ref<StockMap>(loadStock())

  function loadStock(): StockMap {
    try {
      const raw = localStorage.getItem(STOCK_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object') return {}
      const out: StockMap = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const id = Number(k)
        const n = Number(v)
        if (Number.isFinite(id) && Number.isFinite(n) && n >= 0) out[id] = Math.floor(n)
      }
      return out
    } catch {
      return {}
    }
  }

  function setStock(id: number, have: number): void {
    const n = Math.max(0, Math.floor(Number(have) || 0))
    const next: StockMap = { ...stock.value }
    if (n === 0) delete next[id]
    else next[id] = n
    stock.value = next
    try {
      localStorage.setItem(STOCK_KEY, JSON.stringify(next))
    } catch {
      /* 隐私模式下写不了 localStorage，库存在这次会话里还是有效的 */
    }
  }

  const stockInfo = computed(() => {
    void gridVersion.value
    return stockReport(grid.value, stock.value)
  })
  const canUndo = computed(() => {
    void historyVersion.value
    return undoStack.canUndo
  })
  const canRedo = computed(() => {
    void historyVersion.value
    return undoStack.canRedo
  })
  const currentColor = computed<BeadColor | null>(() => colorById(colorId.value))
  const doneCount = computed(() => {
    void doneVersion.value
    let n = 0
    for (let i = 0; i < done.length; i++) if (done[i]) n++
    return n
  })
  const progress = computed(() => (total.value === 0 ? 0 : doneCount.value / total.value))

  // ---------- 里程碑：拼到 1/4、1/2、3/4、完成时给一句鼓励 ----------
  const milestone = ref('')
  const hitMarks = new Set<number>()

  function checkMilestone(): void {
    const t = total.value
    if (t === 0) return
    const p = doneCount.value / t
    const marks: Array<[number, string]> = [
      [0.25, '拼到四分之一啦，手速不错 🌱'],
      [0.5, '一半了，起来伸个懒腰再继续 🍵'],
      [0.75, '快到尾声了，剩一点点 ✨'],
      [1, '拼完啦！可以盖纸熨了 🎉']
    ]
    for (const [mk, msg] of marks) {
      if (p >= mk && !hitMarks.has(mk)) {
        hitMarks.add(mk)
        milestone.value = msg
        if (soundOn.value) playChime()
      }
    }
  }

  /** 跟拼时高亮"该拼的格子"：指定颜色的未完成格；未指定颜色则高亮全部未完成格 */
  const guideHighlight = computed<Uint8Array | null>(() => {
    if (!guideMode.value) return null
    const g = grid.value
    const out = new Uint8Array(g.data.length)
    const pick = guideColorId.value
    for (let i = 0; i < g.data.length; i++) {
      const id = g.data[i]!
      if (id === EMPTY) continue
      if (done[i]) continue
      if (pick !== null && id !== pick) continue
      out[i] = 1
    }
    return out
  })

  const guideDoneMask = computed<Uint8Array | null>(() => {
    if (!guideMode.value) return null
    void doneVersion.value
    return done
  })

  // ---------- 分步跟拼 ----------
  // 思路：不维护"第几颗"的绝对坐标，而是每次现算"还剩哪些格子没拼"（行优先）。
  // 这样用户中途跳着拼、取消勾选、撤销，光标都不会错位——永远指向下一颗没拼的。

  const guideStepMode = ref(false)
  const guideStep = ref(0)

  /** 还没拼的格子（行优先），分步引导就是按这个顺序走 */
  const guideRemainingCells = computed<number[]>(() => {
    void gridVersion.value
    void doneVersion.value
    const g = grid.value
    const out: number[] = []
    for (let i = 0; i < g.data.length; i++) {
      if (g.data[i] === EMPTY) continue
      if (done[i]) continue
      out.push(i)
    }
    return out
  })

  const guideRemaining = computed(() => guideRemainingCells.value.length)

  /** 当前光标指向的格子索引，-1 表示没有 */
  const guideFocusIndex = computed(() => {
    if (!guideStepMode.value) return -1
    const list = guideRemainingCells.value
    if (list.length === 0) return -1
    return list[Math.min(guideStep.value, list.length - 1)] ?? -1
  })

  /** 当前光标坐标，交给渲染器画圈 */
  const guideFocus = computed<{ x: number; y: number } | null>(() => {
    const i = guideFocusIndex.value
    if (i < 0) return null
    const w = grid.value.width
    return { x: i % w, y: Math.floor(i / w) }
  })

  function nextStep(): void {
    guideStep.value = Math.min(guideStep.value + 1, Math.max(0, guideRemaining.value - 1))
  }

  function prevStep(): void {
    guideStep.value = Math.max(0, guideStep.value - 1)
  }

  function resetStep(): void {
    guideStep.value = 0
  }

  /** 光标跳回"按行从上到下"的第一颗，同时把视图交还给画布 */
  function focusFirstRemaining(): void {
    guideStep.value = 0
    guideStepMode.value = true
  }

  // ---------- 内部 ----------

  function touch(): void {
    grid.value.version++
    gridVersion.value++
    dirty.value = true
    scheduleSave()
  }

  /** 只刷新视图，不触发磁盘写入（笔画过程中用） */
  function bump(): void {
    grid.value.version++
    gridVersion.value++
    dirty.value = true
  }

  function resetDone(): void {
    done = new Uint8Array(grid.value.data.length)
    doneVersion.value++
  }

  function mirrorPoints(x: number, y: number): Array<[number, number]> {
    const w = grid.value.width
    const h = grid.value.height
    const pts: Array<[number, number]> = [[x, y]]
    const sym = symmetry.value
    if (sym === 'x' || sym === 'quad') pts.push([w - 1 - x, y])
    if (sym === 'y' || sym === 'quad') pts.push([x, h - 1 - y])
    if (sym === 'quad') pts.push([w - 1 - x, h - 1 - y])
    return pts
  }

  /** 把一次操作应用到所有对称位置 */
  function forEachSymmetric(x: number, y: number, run: (px: number, py: number) => void): void {
    for (const [px, py] of mirrorPoints(x, y)) run(px, py)
  }

  // ---------- 自动保存 ----------
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void persist()
    }, AUTO_SAVE_DELAY)
  }

  async function persist(): Promise<void> {
    const g = grid.value
    const file = createProjectFile(g, {
      id: docId.value,
      name: docName.value,
      pricePerBead: pricePerBead.value,
      done,
      finish: finish.value,
      createdAt: createdAt.value
    })
    try {
      await saveProject({
        id: docId.value,
        name: docName.value,
        width: g.width,
        height: g.height,
        createdAt: createdAt.value,
        updatedAt: Date.now(),
        payload: JSON.stringify(file),
        thumb: g.usedCount() > 0 ? renderThumbnail(g, 200) : undefined,
        beads: g.usedCount(),
        finish: finish.value
      })
      lastSavedAt.value = Date.now()
      dirty.value = false
    } catch (err) {
      console.warn('自动保存失败', err)
    }
  }

  // ---------- 绘制 ----------

  function beginStroke(): void {
    strokeSnapshot = grid.value.snapshot()
  }

  function endStroke(): void {
    if (!strokeSnapshot) return
    const snap = strokeSnapshot
    strokeSnapshot = null
    const g = grid.value
    const patch = diffSnapshot(snap, g.data, g.width, g.height)
    if (!patch) return
    undoStack.push(patch)
    historyVersion.value++
    touch()
  }

  function cancelStroke(): void {
    if (!strokeSnapshot) return
    grid.value.restore(strokeSnapshot)
    strokeSnapshot = null
    gridVersion.value++
  }

  function paintCell(x: number, y: number, forceColor?: number): void {
    const color = forceColor ?? colorId.value
    if (!grid.value.inBounds(x, y)) return
    forEachSymmetric(x, y, (px, py) => {
      if (brushSize.value <= 1) grid.value.set(px, py, color)
      else grid.value.setFat(px, py, color, brushSize.value)
    })
    tick()
    bump()
  }

  function eraseCell(x: number, y: number): void {
    forEachSymmetric(x, y, (px, py) => {
      if (brushSize.value <= 1) grid.value.set(px, py, EMPTY)
      else grid.value.setFat(px, py, EMPTY, brushSize.value)
    })
    tick()
    bump()
  }

  function bucketAt(x: number, y: number): void {
    if (!grid.value.inBounds(x, y)) return
    beginStroke()
    grid.value.floodFill(x, y, colorId.value)
    bump()
    endStroke()
  }

  function pickAt(x: number, y: number): number | null {
    const id = grid.value.get(x, y)
    if (id === EMPTY) return null
    colorId.value = id
    return id
  }

  function shapeTo(kind: 'line' | 'rect' | 'rectFill' | 'ellipse' | 'ellipseFill', a: { x: number; y: number }, b: { x: number; y: number }): void {
    const color = colorId.value
    const size = brushSize.value
    if (kind === 'line') grid.value.line(a.x, a.y, b.x, b.y, color, size)
    if (kind === 'rect') grid.value.rect(a.x, a.y, b.x, b.y, color, false, size)
    if (kind === 'rectFill') grid.value.rect(a.x, a.y, b.x, b.y, color, true, size)
    if (kind === 'ellipse') grid.value.ellipse(a.x, a.y, b.x, b.y, color, false, size)
    if (kind === 'ellipseFill') grid.value.ellipse(a.x, a.y, b.x, b.y, color, true, size)
    bump()
  }

  /** 形状预览：把结果写进一个临时网格再取差异区域，交给渲染器做半透明预览 */
  function previewShape(kind: 'line' | 'rect' | 'rectFill' | 'ellipse' | 'ellipseFill', a: { x: number; y: number }, b: { x: number; y: number }) {
    const g = grid.value
    const tmp = g.clone()
    const color = colorId.value
    const size = brushSize.value
    if (kind === 'line') tmp.line(a.x, a.y, b.x, b.y, color, size)
    if (kind === 'rect') tmp.rect(a.x, a.y, b.x, b.y, color, false, size)
    if (kind === 'rectFill') tmp.rect(a.x, a.y, b.x, b.y, color, true, size)
    if (kind === 'ellipse') tmp.ellipse(a.x, a.y, b.x, b.y, color, false, size)
    if (kind === 'ellipseFill') tmp.ellipse(a.x, a.y, b.x, b.y, color, true, size)

    const x0 = Math.min(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const w = Math.abs(a.x - b.x) + 1 + size
    const h = Math.abs(a.y - b.y) + 1 + size
    const region = tmp.extractRect(x0, y0, Math.min(w, g.width - x0), Math.min(h, g.height - y0))
    return { x: x0, y: y0, w: Math.min(w, g.width - x0), h: Math.min(h, g.height - y0), data: region }
  }

  function commitShape(kind: 'line' | 'rect' | 'rectFill' | 'ellipse' | 'ellipseFill', a: { x: number; y: number }, b: { x: number; y: number }): void {
    beginStroke()
    shapeTo(kind, a, b)
    endStroke()
  }

  // ---------- 历史 ----------

  function undo(): void {
    if (undoStack.undo(grid.value)) {
      gridVersion.value++
      historyVersion.value++
      dirty.value = true
      scheduleSave()
    }
  }

  function redo(): void {
    if (undoStack.redo(grid.value)) {
      gridVersion.value++
      historyVersion.value++
      dirty.value = true
      scheduleSave()
    }
  }

  // ---------- 文档级操作 ----------

  function replaceColor(from: number, to: number): void {
    beginStroke()
    grid.value.replaceColor(from, to)
    endStroke()
  }

  function transform(kind: 'flipX' | 'flipY' | 'rotate180'): void {
    beginStroke()
    grid.value.transform(kind)
    endStroke()
  }

  function clearAll(): void {
    beginStroke()
    grid.value.clear()
    endStroke()
    resetDone()
  }

  function fillAll(color = colorId.value): void {
    beginStroke()
    grid.value.fill(color)
    endStroke()
  }

  /** 顺时针旋转 90°（宽高互换，属于文档级操作，会清掉跟拼进度） */
  function rotate90(): void {
    loadGrid(grid.value.rotated90(), { keepName: true })
  }

  /** 重设画布尺寸：内容保持居中（超出部分裁掉，空白处留空） */
  function resizeCanvas(w: number, h: number): void {
    const width = Math.max(8, Math.min(400, Math.round(w)))
    const height = Math.max(8, Math.min(400, Math.round(h)))
    const old = grid.value
    if (width === old.width && height === old.height) return
    const copyW = Math.min(width, old.width)
    const copyH = Math.min(height, old.height)
    const region = old.extractRect(
      Math.floor((old.width - copyW) / 2),
      Math.floor((old.height - copyH) / 2),
      copyW,
      copyH
    )
    const next = new BeadGrid(width, height)
    next.blitRect(Math.floor((width - copyW) / 2), Math.floor((height - copyH) / 2), copyW, copyH, region)
    loadGrid(next, { keepName: true })
  }

  /** 把整张图纸的配色吸附到某套色卡，返回换了哪些色 */
  function fitPalette(set: ColorSetId): FitResult {
    beginStroke()
    const res = fitToColorSet(grid.value, set)
    endStroke()
    return res
  }

  // ---------- 我有的色号：只显示手头买得到的颜色 ----------
  const OWNED_KEY = 'bead:owned'
  /** null 表示"全都有"，不用维护清单 */
  const ownedIds = ref<number[] | null>(loadOwned())
  const onlyOwned = ref(false)

  function loadOwned(): number[] | null {
    try {
      const raw = localStorage.getItem(OWNED_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return null
      const list = parsed.filter((v): v is number => typeof v === 'number' && v > 0)
      return list.length > 0 ? list : null
    } catch {
      return null
    }
  }

  function saveOwned(list: number[] | null): void {
    try {
      if (list === null) localStorage.removeItem(OWNED_KEY)
      else localStorage.setItem(OWNED_KEY, JSON.stringify(list))
    } catch {
      /* 存不了也不影响这次编辑 */
    }
  }

  const hasOwnedList = computed(() => ownedIds.value !== null)

  /** 编辑时真正可用的色号（没有清单就是全部） */
  const ownedColors = computed<BeadColor[]>(() => {
    const list = ownedIds.value
    if (list === null) return COLORS
    const set = new Set(list)
    return COLORS.filter((c) => set.has(c.id))
  })

  const ownedSummary = computed(() => `${ownedColors.value.length} / ${COLORS.length} 色`)

  function isOwned(id: number): boolean {
    const list = ownedIds.value
    return list === null || list.includes(id)
  }

  function toggleOwned(id: number): void {
    const set = new Set(ownedIds.value ?? COLORS.map((c) => c.id))
    if (set.has(id)) set.delete(id)
    else set.add(id)
    const next = [...set].sort((a, b) => a - b)
    ownedIds.value = next.length > 0 ? next : null
    saveOwned(ownedIds.value)
  }

  function ownAll(): void {
    ownedIds.value = null
    saveOwned(null)
  }

  /** 把整张图换成"我有的色号"里最接近的颜色 */
  function fitOwned(): FitResult {
    beginStroke()
    const res = fitToColors(grid.value, ownedColors.value)
    endStroke()
    return res
  }

  /** 裁掉四周空白，并把网格尺寸缩到内容大小 */  function trim(): void {
    const t = grid.value.trimmed()
    if (t.width === grid.value.width && t.height === grid.value.height) return
    loadGrid(t, { keepName: true })
  }

  function loadGrid(next: BeadGrid, opts: { keepName?: boolean; newId?: boolean } = {}): void {
    grid.value = next
    resetDone()
    hitMarks.clear()
    milestone.value = ''
    undoStack.clear()
    historyVersion.value++
    gridVersion.value++
    selection.value = null
    if (opts.newId) {
      docId.value = crypto.randomUUID()
      createdAt.value = Date.now()
    }
    if (!opts.keepName) docName.value = docName.value || '未命名图纸'
    dirty.value = true
    scheduleSave()
  }

  function newProject(name: string, w: number, h: number): void {
    docName.value = name.trim() || '未命名图纸'
    loadGrid(new BeadGrid(w, h), { newId: true })
  }

  function loadParsed(parsed: ParsedProject): void {
    docId.value = parsed.id
    docName.value = parsed.name
    createdAt.value = parsed.createdAt
    pricePerBead.value = parsed.pricePerBead
    if (parsed.finish && IRON_FINISHES.some((f) => f.id === parsed.finish)) {
      finish.value = parsed.finish as IronFinishId
    }
    grid.value = parsed.grid
    done = parsed.done.length === parsed.grid.data.length ? parsed.done : new Uint8Array(parsed.grid.data.length)
    doneVersion.value++
    undoStack.clear()
    historyVersion.value++
    gridVersion.value++
    selection.value = null
    dirty.value = true
    scheduleSave()
  }

  async function openProject(id: string): Promise<boolean> {
    const rec = await loadProject(id)
    if (!rec) return false
    const parsed = parseProjectFile(JSON.parse(rec.payload))
    loadParsed(parsed)
    return true
  }

  /** 改作品名（只改本机仓库里的那条记录，不动当前画布） */
  async function renameProject(id: string, name: string): Promise<boolean> {
    const rec = await loadProject(id)
    if (!rec) return false
    const nextName = name.trim() || '未命名'
    const doc = JSON.parse(rec.payload) as Record<string, unknown>
    doc.name = nextName
    doc.updatedAt = Date.now()
    await saveProject({ ...rec, name: nextName, updatedAt: Date.now(), payload: JSON.stringify(doc) })
    if (id === docId.value) docName.value = nextName
    return true
  }

  /** 复制一份作品（换个 id，原作品不动） */
  async function duplicateProject(id: string): Promise<string | null> {
    const rec = await loadProject(id)
    if (!rec) return null
    const parsed = parseProjectFile(JSON.parse(rec.payload))
    const newId = crypto.randomUUID()
    const name = (rec.name || '未命名') + ' 副本'
    const file = createProjectFile(parsed.grid, {
      id: newId,
      name,
      pricePerBead: parsed.pricePerBead,
      done: parsed.done,
      finish: parsed.finish ?? undefined,
      createdAt: Date.now()
    })
    await saveProject({
      id: newId,
      name,
      width: parsed.grid.width,
      height: parsed.grid.height,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      payload: JSON.stringify(file),
      thumb: renderThumbnail(parsed.grid, 200),
      beads: parsed.grid.usedCount(),
      finish: parsed.finish ?? 'raw'
    })
    return newId
  }

  async function removeProject(id: string): Promise<void> {

    await deleteProject(id)
    if (id === docId.value) {
      docId.value = crypto.randomUUID()
      createdAt.value = Date.now()
    }
  }

  async function listAll(): Promise<ProjectSummary[]> {
    try {
      return await listProjects()
    } catch (err) {
      console.warn('读取工程列表失败', err)
      return []
    }
  }

  function projectFileJson(): string {
    const file = createProjectFile(grid.value, {
      id: docId.value,
      name: docName.value,
      pricePerBead: pricePerBead.value,
      done,
      finish: finish.value,
      createdAt: createdAt.value
    })
    return JSON.stringify(file)
  }

  /** 重新导入文件后如果尺寸不同也能用 */
  function importJson(text: string): void {
    loadParsed(parseProjectFile(JSON.parse(text)))
  }

  // ---------- 选择区 ----------

  function setSelection(sel: Selection | null): void {
    selection.value = sel
  }

  function copySelection(): boolean {
    const s = selection.value
    if (!s) return false
    clipboard = grid.value.extractRect(s.x, s.y, s.w, s.h)
    clipboardSize = { w: s.w, h: s.h }
    return true
  }

  function cutSelection(): boolean {
    const s = selection.value
    if (!s) return false
    copySelection()
    beginStroke()
    grid.value.blitRect(s.x, s.y, clipboardSize.w, clipboardSize.h, new Uint16Array(clipboardSize.w * clipboardSize.h))
    endStroke()
    return true
  }

  function pasteSelection(at?: { x: number; y: number }): void {
    if (!clipboard) return
    const s = selection.value
    const x = at?.x ?? s?.x ?? 0
    const y = at?.y ?? s?.y ?? 0
    beginStroke()
    grid.value.blitRect(x, y, clipboardSize.w, clipboardSize.h, clipboard)
    endStroke()
    selection.value = { x, y, w: clipboardSize.w, h: clipboardSize.h }
  }

  // ---------- 跟拼 ----------

  function setDone(x: number, y: number, value: boolean): void {
    const i = grid.value.index(x, y)
    if (i < 0 || i >= done.length) return
    if (done[i] === (value ? 1 : 0)) return
    done[i] = value ? 1 : 0
    doneVersion.value++
    if (value) {
      tick()
      checkMilestone()
    }
    dirty.value = true
    scheduleSave()
  }

  function toggleDoneAt(x: number, y: number): void {
    setDone(x, y, !done[grid.value.index(x, y)])
  }

  function isDone(x: number, y: number): boolean {
    return done[grid.value.index(x, y)] === 1
  }

  function markColorDone(id: number): void {
    for (let i = 0; i < grid.value.data.length; i++) {
      if (grid.value.data[i] === id) done[i] = 1
    }
    doneVersion.value++
    dirty.value = true
    scheduleSave()
  }

  function clearDone(): void {
    resetDone()
    dirty.value = true
    scheduleSave()
  }

  // ---------- 持久化权限 ----------
  const persisted = ref(false)
  async function ensurePersist(): Promise<void> {
    persisted.value = await requestPersistentStorage()
  }

  return {
    // 文档
    grid,
    gridVersion,
    docId,
    docName,
    createdAt,
    pricePerBead,
    lastSavedAt,
    dirty,
    width,
    height,
    // 工具
    tool,
    colorId,
    brushSize,
    symmetry,
    style,
    showGrid,
    showNumbers,
    showBoards,
    finish,
    finishInfo,
    setFinish,
    selection,
    // 跟拼
    guideMode,
    guideColorId,
    guideHighlight,
    guideDoneMask,
    guideStepMode,
    guideStep,
    guideRemaining,
    guideFocus,
    nextStep,
    prevStep,
    resetStep,
    focusFirstRemaining,
    doneCount,
    progress,
    // 派生
    usage,
    total,
    cost,
    physical,
    stock,
    setStock,
    stockInfo,
    soundOn,
    setSoundOn,
    sessionMinutes,
    resetSession,
    startClock,
    stopClock,
    sitReminder,
    setSitReminder,
    restDue,
    ackRest,
    nextRestIn,
    milestone,
    canUndo,
    canRedo,
    currentColor,
    // 操作
    beginStroke,
    endStroke,
    cancelStroke,
    paintCell,
    eraseCell,
    bucketAt,
    pickAt,
    shapeTo,
    previewShape,
    commitShape,
    undo,
    redo,
    replaceColor,
    transform,
    rotate90,
    resizeCanvas,
    fitPalette,
    ownedIds,
    onlyOwned,
    hasOwnedList,
    ownedColors,
    ownedSummary,
    isOwned,
    toggleOwned,
    ownAll,
    fitOwned,
    clearAll,
    fillAll,
    trim,
    loadGrid,
    newProject,
    loadParsed,
    openProject,
    removeProject,
    renameProject,
    duplicateProject,
    listAll,
    projectFileJson,
    importJson,
    persist,
    setSelection,
    copySelection,
    cutSelection,
    pasteSelection,
    setDone,
    toggleDoneAt,
    isDone,
    markColorDone,
    clearDone,
    ensurePersist,
    persisted
  }
})
