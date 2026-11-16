import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { COLORS, colorById, type BeadColor } from '@/core/colors'
import { BeadGrid, EMPTY } from '@/core/grid'
import { UndoStack, diffSnapshot } from '@/core/history'
import { colorUsage, estimateCost } from '@/core/pattern'
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
        thumb: g.usedCount() > 0 ? renderThumbnail(g, 200) : undefined
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
    bump()
  }

  function eraseCell(x: number, y: number): void {
    forEachSymmetric(x, y, (px, py) => {
      if (brushSize.value <= 1) grid.value.set(px, py, EMPTY)
      else grid.value.setFat(px, py, EMPTY, brushSize.value)
    })
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

  /** 裁掉四周空白，并把网格尺寸缩到内容大小 */
  function trim(): void {
    const t = grid.value.trimmed()
    if (t.width === grid.value.width && t.height === grid.value.height) return
    loadGrid(t, { keepName: true })
  }

  function loadGrid(next: BeadGrid, opts: { keepName?: boolean; newId?: boolean } = {}): void {
    grid.value = next
    resetDone()
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
    selection,
    // 跟拼
    guideMode,
    guideColorId,
    guideHighlight,
    guideDoneMask,
    doneCount,
    progress,
    // 派生
    usage,
    total,
    cost,
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
    clearAll,
    fillAll,
    trim,
    loadGrid,
    newProject,
    loadParsed,
    openProject,
    removeProject,
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
