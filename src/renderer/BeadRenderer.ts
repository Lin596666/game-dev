import { colorById, inkOn } from '@/core/colors'
import { EMPTY, type BeadGrid } from '@/core/grid'

/**
 * 拼豆画布渲染器（Canvas 2D，命令式，不参与框架响应式）
 *
 * 性能策略：
 * 1) 底色层用「网格分辨率」离屏位图，1px = 1 颗豆，缩放时一次 drawImage（关掉平滑保持锐利）。
 * 2) 珠子孔洞/高光只在可视区域内批量生成「一条 Path」再一次性填充——开销只与
 *    「屏幕能看见几颗」有关，与网格总量无关，200×200 也不掉帧。
 * 3) 网格线、编号、标尺都有缩放阈值，缩小时自动省略。
 */

export type RenderStyle = 'bead' | 'flat' | 'chart'

export interface ViewState {
  zoom: number
  offsetX: number
  offsetY: number
}

export interface RenderOptions {
  style: RenderStyle
  showGrid: boolean
  showNumbers: boolean
  showRulers: boolean
  paperColor: string
}

export interface PreviewPatch {
  x: number
  y: number
  w: number
  h: number
  data: Uint16Array
}

export interface GuideState {
  /** 当前该拼的格子（0/1），null 表示高亮全部 */
  highlight: Uint8Array | null
  /** 已拼好的格子（0/1） */
  done: Uint8Array | null
  /** 高亮格子的强调色 */
  accent: string
  /** 分步引导：光标所在格子，画一个描边圈提示"下一颗在这里" */
  focus: { x: number; y: number } | null
}

export interface SelectionRect {
  x: number
  y: number
  w: number
  h: number
}

export const MIN_ZOOM = 0.4
export const MAX_ZOOM = 48
export const HOLE_MIN_ZOOM = 8
export const NUMBER_MIN_ZOOM = 17
export const GRIDLINE_MIN_ZOOM = 5

export class BeadRenderer {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private grid: BeadGrid | null = null
  private view: ViewState = { zoom: 1, offsetX: 0, offsetY: 0 }
  private options: RenderOptions = {
    style: 'bead',
    showGrid: true,
    showNumbers: false,
    showRulers: true,
    paperColor: '#FBF7F1'
  }
  private preview: PreviewPatch | null = null
  private selection: SelectionRect | null = null
  private guide: GuideState = { highlight: null, done: null, accent: '#C97B5A', focus: null }

  private cssWidth = 0
  private cssHeight = 0
  private dpr = 1
  private frame = 0

  private bitmap: HTMLCanvasElement | null = null
  private bitmapVersion = -1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D')
    this.ctx = ctx
  }

  setGrid(grid: BeadGrid | null): void {
    this.grid = grid
    this.bitmapVersion = -1
    this.invalidate()
  }

  setView(view: ViewState): void {
    this.view = view
    this.invalidate()
  }

  getView(): ViewState {
    return { ...this.view }
  }

  setOptions(partial: Partial<RenderOptions>): void {
    this.options = { ...this.options, ...partial }
    this.invalidate()
  }

  setPreview(patch: PreviewPatch | null): void {
    this.preview = patch
    this.invalidate()
  }

  setSelection(rect: SelectionRect | null): void {
    this.selection = rect
    this.invalidate()
  }

  setGuide(guide: Partial<GuideState>): void {
    this.guide = { ...this.guide, ...guide }
    this.invalidate()
  }

  resize(cssWidth: number, cssHeight: number, dpr = window.devicePixelRatio || 1): void {
    this.cssWidth = Math.max(1, Math.round(cssWidth))
    this.cssHeight = Math.max(1, Math.round(cssHeight))
    this.dpr = dpr
    this.canvas.width = Math.round(this.cssWidth * dpr)
    this.canvas.height = Math.round(this.cssHeight * dpr)
    this.canvas.style.width = `${this.cssWidth}px`
    this.canvas.style.height = `${this.cssHeight}px`
    this.invalidate()
  }

  invalidate(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  // ---------- 坐标 ----------

  screenToCell(px: number, py: number): { x: number; y: number } {
    return {
      x: Math.floor((px - this.view.offsetX) / this.view.zoom),
      y: Math.floor((py - this.view.offsetY) / this.view.zoom)
    }
  }

  cellToScreen(x: number, y: number): { px: number; py: number } {
    return {
      px: x * this.view.zoom + this.view.offsetX,
      py: y * this.view.zoom + this.view.offsetY
    }
  }

  zoomAt(factor: number, anchorX: number, anchorY: number): ViewState {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.zoom * factor))
    const k = zoom / this.view.zoom
    this.view = {
      zoom,
      offsetX: anchorX - (anchorX - this.view.offsetX) * k,
      offsetY: anchorY - (anchorY - this.view.offsetY) * k
    }
    this.invalidate()
    return { ...this.view }
  }

  panBy(dx: number, dy: number): ViewState {
    this.view = {
      ...this.view,
      offsetX: this.view.offsetX + dx,
      offsetY: this.view.offsetY + dy
    }
    this.invalidate()
    return { ...this.view }
  }

  fitToView(padding = 48): ViewState {
    const g = this.grid
    if (!g || this.cssWidth === 0) return { ...this.view }
    const zoom = Math.min(
      (this.cssWidth - padding * 2) / g.width,
      (this.cssHeight - padding * 2) / g.height
    )
    this.view = {
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)),
      offsetX: (this.cssWidth - g.width * Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))) / 2,
      offsetY: (this.cssHeight - g.height * Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))) / 2
    }
    this.invalidate()
    return { ...this.view }
  }

  center(): ViewState {
    const g = this.grid
    if (!g) return { ...this.view }
    this.view = {
      ...this.view,
      offsetX: (this.cssWidth - g.width * this.view.zoom) / 2,
      offsetY: (this.cssHeight - g.height * this.view.zoom) / 2
    }
    this.invalidate()
    return { ...this.view }
  }

  // ---------- 位图缓存 ----------

  private ensureBitmap(): HTMLCanvasElement | null {
    const g = this.grid
    if (!g) return null
    if (this.bitmap && this.bitmapVersion === g.version && this.bitmap.width === g.width) {
      return this.bitmap
    }
    if (!this.bitmap || this.bitmap.width !== g.width || this.bitmap.height !== g.height) {
      this.bitmap = document.createElement('canvas')
      this.bitmap.width = g.width
      this.bitmap.height = g.height
    }
    const bctx = this.bitmap.getContext('2d')
    if (!bctx) return null

    const img = bctx.createImageData(g.width, g.height)
    const px = img.data
    for (let i = 0; i < g.data.length; i++) {
      const id = g.data[i]!
      if (id === EMPTY) continue
      const color = colorById(id)
      if (!color) continue
      const o = i * 4
      px[o] = color.rgb[0]
      px[o + 1] = color.rgb[1]
      px[o + 2] = color.rgb[2]
      px[o + 3] = 255
    }
    bctx.putImageData(img, 0, 0)
    this.bitmapVersion = g.version
    return this.bitmap
  }

  // ---------- 主渲染 ----------

  render(): void {
    const ctx = this.ctx
    const W = this.cssWidth
    const H = this.cssHeight
    if (W === 0 || H === 0) return

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = this.options.paperColor
    ctx.fillRect(0, 0, W, H)

    const g = this.grid
    if (!g) return

    const z = this.view.zoom
    const ox = this.view.offsetX
    const oy = this.view.offsetY
    const x0 = Math.max(0, Math.floor(-ox / z))
    const y0 = Math.max(0, Math.floor(-oy / z))
    const x1 = Math.min(g.width - 1, Math.ceil((W - ox) / z))
    const y1 = Math.min(g.height - 1, Math.ceil((H - oy) / z))

    const bmp = this.ensureBitmap()
    if (bmp) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(bmp, 0, 0, g.width, g.height, ox, oy, g.width * z, g.height * z)
    }

    if (this.options.style === 'bead' && z >= HOLE_MIN_ZOOM) {
      this.drawBeadDetail(g, ox, oy, z, x0, y0, x1, y1)
    }
    if (this.options.style !== 'chart') {
      this.drawGuide(g, ox, oy, z, x0, y0, x1, y1)
    }
    if (this.options.showGrid && z >= GRIDLINE_MIN_ZOOM) {
      this.drawGridLines(ox, oy, z, x0, y0, x1, y1)
    }
    if (this.options.showNumbers && z >= NUMBER_MIN_ZOOM) {
      this.drawNumbers(g, ox, oy, z, x0, y0, x1, y1)
    }
    this.drawPreview(ctx, ox, oy, z)
    this.drawSelection(ox, oy, z)
    this.drawRulers(g, ox, oy, z, x0, y0, x1, y1)
  }

  /** 珠子质感：孔洞 + 顶部高光 + 轻微内阴影 */
  private drawBeadDetail(
    g: BeadGrid,
    ox: number,
    oy: number,
    z: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): void {
    const ctx = this.ctx
    const holeR = Math.max(0.8, z * 0.17)
    const inset = z * 0.5

    const holes = new Path2D()
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (g.get(x, y) === EMPTY) continue
        const cx = ox + x * z + inset
        const cy = oy + y * z + inset
        holes.moveTo(cx + holeR, cy)
        holes.arc(cx, cy, holeR, 0, Math.PI * 2)
      }
    }

    ctx.save()
    ctx.fillStyle = this.options.paperColor
    ctx.fill(holes)
    if (z >= 14) {
      ctx.strokeStyle = 'rgba(60, 48, 38, 0.10)'
      ctx.lineWidth = Math.max(1, z * 0.045)
      ctx.stroke(holes)
    }
    ctx.restore()

    if (z >= 15) {
      // 顶弧高光：一颗珠子一条弧，画成同一 path 一次填充
      const sheen = new Path2D()
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (g.get(x, y) === EMPTY) continue
          const cx = ox + x * z + inset
          const cy = oy + y * z + inset
          const r = z * 0.34
          sheen.moveTo(cx + r * Math.cos(-Math.PI * 0.82), cy + r * Math.sin(-Math.PI * 0.82))
          sheen.arc(cx, cy, r, -Math.PI * 0.82, -Math.PI * 0.18)
        }
      }
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)'
      ctx.lineWidth = Math.max(1, z * 0.1)
      ctx.lineCap = 'round'
      ctx.stroke(sheen)
      ctx.restore()
    }
  }

  /** 跟拼模式：已拼的发白，该拼的描强调色 */
  private drawGuide(
    g: BeadGrid,
    ox: number,
    oy: number,
    z: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): void {
    const done = this.guide.done
    const highlight = this.guide.highlight
    const focus = this.guide.focus
    if (!done && !highlight && !focus) return

    const ctx = this.ctx

    if (done) {
      const path = new Path2D()
      let any = false
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!done[y * g.width + x]) continue
          path.rect(ox + x * z, oy + y * z, z, z)
          any = true
        }
      }
      if (any) {
        ctx.save()
        ctx.fillStyle = 'rgba(251, 247, 241, 0.74)'
        ctx.fill(path)
        ctx.restore()
      }
    }

    if (highlight) {
      const path = new Path2D()
      let any = false
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!highlight[y * g.width + x]) continue
          path.rect(ox + x * z, oy + y * z, z, z)
          any = true
        }
      }
      if (any) {
        ctx.save()
        ctx.fillStyle = this.hexToRgba(this.guide.accent, 0.26)
        ctx.fill(path)
        if (z >= 6) {
          ctx.strokeStyle = this.guide.accent
          ctx.lineWidth = Math.max(1, z * 0.06)
          ctx.stroke(path)
        }
        ctx.restore()
      }
    }

    // 分步引导的光标：外圈强调色 + 内侧留白，任何缩放下都能一眼看到
    if (focus && focus.x >= x0 && focus.x <= x1 && focus.y >= y0 && focus.y <= y1) {
      const cx = ox + (focus.x + 0.5) * z
      const cy = oy + (focus.y + 0.5) * z
      const outer = Math.max(6, z * 0.62)
      ctx.save()
      ctx.lineWidth = Math.max(1.5, z * 0.1)
      ctx.strokeStyle = this.guide.accent
      ctx.beginPath()
      ctx.arc(cx, cy, outer, 0, Math.PI * 2)
      ctx.stroke()
      if (z >= 7) {
        ctx.lineWidth = Math.max(1, z * 0.05)
        ctx.strokeStyle = this.hexToRgba(this.guide.accent, 0.5)
        ctx.beginPath()
        ctx.arc(cx, cy, outer * 0.62, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  private drawGridLines(
    ox: number,
    oy: number,
    z: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): void {
    const ctx = this.ctx
    const thin = new Path2D()
    const thick = new Path2D()
    const every = z >= 9 ? 1 : 5

    for (let x = x0; x <= x1 + 1; x++) {
      if (x % every !== 0) continue
      const px = Math.round(ox + x * z) + 0.5
      const target = x % 10 === 0 ? thick : thin
      target.moveTo(px, oy + y0 * z)
      target.lineTo(px, oy + (y1 + 1) * z)
    }
    for (let y = y0; y <= y1 + 1; y++) {
      if (y % every !== 0) continue
      const py = Math.round(oy + y * z) + 0.5
      const target = y % 10 === 0 ? thick : thin
      target.moveTo(ox + x0 * z, py)
      target.lineTo(ox + (x1 + 1) * z, py)
    }

    ctx.save()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(74, 60, 46, 0.10)'
    ctx.stroke(thin)
    ctx.strokeStyle = 'rgba(74, 60, 46, 0.22)'
    ctx.stroke(thick)
    ctx.restore()
  }

  private drawNumbers(
    g: BeadGrid,
    ox: number,
    oy: number,
    z: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): void {
    const ctx = this.ctx
    const font = `600 ${Math.round(z * 0.34)}px ui-monospace, "SFMono-Regular", Menlo, monospace`
    ctx.save()
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    let lastInk = ''
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const id = g.get(x, y)
        if (id === EMPTY) continue
        const color = colorById(id)
        if (!color) continue
        const ink = inkOn(color.hex)
        if (ink !== lastInk) {
          ctx.fillStyle = ink
          lastInk = ink
        }
        ctx.fillText(color.code, ox + x * z + z / 2, oy + y * z + z / 2 + z * 0.02)
      }
    }
    ctx.restore()
  }

  private drawPreview(ctx: CanvasRenderingContext2D, ox: number, oy: number, z: number): void {
    const p = this.preview
    if (!p) return
    ctx.save()
    ctx.globalAlpha = 0.72
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const id = p.data[y * p.w + x]!
        if (id === EMPTY) continue
        const color = colorById(id)
        if (!color) continue
        ctx.fillStyle = color.hex
        ctx.fillRect(ox + (p.x + x) * z, oy + (p.y + y) * z, z, z)
      }
    }
    ctx.restore()
  }

  private drawSelection(ox: number, oy: number, z: number): void {
    const s = this.selection
    if (!s) return
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = '#C97B5A'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.strokeRect(ox + s.x * z + 0.5, oy + s.y * z + 0.5, s.w * z, s.h * z)
    ctx.restore()
  }

  private drawRulers(
    g: BeadGrid,
    ox: number,
    oy: number,
    z: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): void {
    if (z < 7) return
    const ctx = this.ctx
    const step = z >= 14 ? 5 : 10
    ctx.save()
    ctx.font = '500 10px ui-monospace, Menlo, monospace'
    ctx.fillStyle = 'rgba(120, 106, 92, 0.85)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    for (let x = x0; x <= x1; x++) {
      if ((x + 1) % step !== 0) continue
      ctx.fillText(String(x + 1), ox + x * z + z / 2, oy - 4)
    }

    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let y = y0; y <= y1; y++) {
      if ((y + 1) % step !== 0) continue
      ctx.fillText(String(y + 1), ox - 4, oy + y * z + z / 2)
    }
    void g
    ctx.restore()
  }

  private hexToRgba(hex: string, alpha: number): string {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const gg = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r}, ${gg}, ${b}, ${alpha})`
  }
}
