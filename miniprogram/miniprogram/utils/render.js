/**
 * 小程序端画布渲染器。
 *
 * 和 Web 版（src/renderer/BeadRenderer.ts）是同一套思路的简化版：
 * 只画视口内的格子、网格线用一条 path 批量描、10 格加粗。
 * 这里不做珠子高光/孔洞——小程序性能更紧，而且小屏上看出不太出来。
 */
const core = require('../core/index.js')

const PAPER = '#FBF7F1'
const LINE = '#E4DBCD'
const LINE_STRONG = '#D5C8B2'
const INK = '#6D6459'

const HEX = new Map()
for (const c of core.COLORS) HEX.set(c.id, c.hex)
const CODE = new Map()
for (const c of core.COLORS) CODE.set(c.id, c.code)

const MIN_ZOOM = 3
const MAX_ZOOM = 48

class Renderer {
  constructor(canvas, ctx, cssW, cssH, dpr) {
    this.canvas = canvas
    this.ctx = ctx
    this.cssW = cssW
    this.cssH = cssH
    this.dpr = dpr || 1
    this.grid = null
    this.zoom = 12
    this.ox = 0
    this.oy = 0
    this.showNumbers = false
    this.guide = { mode: false, done: null, colorId: 0, focus: null }
    this.finish = core.finishById('raw')
    this.sparkleAt = core.sparkleAt
    this.resize(cssW, cssH, this.dpr)
  }

  setGrid(grid) {
    this.grid = grid
    this.fit()
  }

  setOptions(opts) {
    if (typeof opts.showNumbers === 'boolean') this.showNumbers = opts.showNumbers
    if (opts.finish) this.finish = opts.finish
    if (typeof opts.sparkleAt === 'function') this.sparkleAt = opts.sparkleAt
    this.render()
  }

  setGuide(guide) {
    this.guide = Object.assign({ mode: false, done: null, colorId: 0, focus: null }, guide || {})
    this.render()
  }

  resize(cssW, cssH, dpr) {
    this.cssW = cssW
    this.cssH = cssH
    this.dpr = dpr || this.dpr
    if (this.canvas) {
      this.canvas.width = Math.round(cssW * this.dpr)
      this.canvas.height = Math.round(cssH * this.dpr)
    }
  }

  fit() {
    if (!this.grid) return
    const pad = 12
    const z = Math.min((this.cssW - pad * 2) / this.grid.width, (this.cssH - pad * 2) / this.grid.height)
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
    this.center()
  }

  center() {
    if (!this.grid) return
    this.ox = (this.cssW - this.grid.width * this.zoom) / 2
    this.oy = (this.cssH - this.grid.height * this.zoom) / 2
  }

  zoomAt(factor, ax, ay) {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor))
    const k = next / this.zoom
    this.ox = ax - (ax - this.ox) * k
    this.oy = ay - (ay - this.oy) * k
    this.zoom = next
  }

  panBy(dx, dy) {
    this.ox += dx
    this.oy += dy
  }

  screenToCell(px, py) {
    if (!this.grid) return null
    const x = Math.floor((px - this.ox) / this.zoom)
    const y = Math.floor((py - this.oy) / this.zoom)
    if (x < 0 || y < 0 || x >= this.grid.width || y >= this.grid.height) return null
    return { x, y }
  }

  render() {
    const ctx = this.ctx
    const g = this.grid
    if (!ctx) return
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, this.cssW, this.cssH)
    if (!g) return

    const z = this.zoom
    const x0 = Math.max(0, Math.floor(-this.ox / z))
    const y0 = Math.max(0, Math.floor(-this.oy / z))
    const x1 = Math.min(g.width - 1, Math.ceil((this.cssW - this.ox) / z))
    const y1 = Math.min(g.height - 1, Math.ceil((this.cssH - this.oy) / z))
    if (x1 < x0 || y1 < y0) return

    // 1. 空白纸面（内容区外框）
    ctx.fillStyle = '#FFFDFA'
    ctx.fillRect(this.ox, this.oy, g.width * z, g.height * z)

    // 2. 珠子（熨过的压成方糖状，多一圈高光；带闪粉的再撒亮点）
    const half = z + 0.6
    const f = this.finish
    const ironed = !!(f && f.ironed)
    const sparkleOn = !!(f && f.sparkle > 0) && z >= 6 && this.sparkleAt
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const v = g.data[y * g.width + x]
        if (!v) continue
        ctx.fillStyle = HEX.get(v) || '#DDD'
        ctx.fillRect(this.ox + x * z, this.oy + y * z, half, half)
        if (ironed && z >= 8) {
          const bx = this.ox + x * z
          const by = this.oy + y * z
          ctx.fillStyle = 'rgba(255,255,255,0.45)'
          ctx.fillRect(bx, by, half, 1)
          ctx.fillRect(bx, by, 1, half)
        }
        if (sparkleOn) {
          const sp = this.sparkleAt(x, y, f)
          if (sp.on) {
            const r = Math.max(1, sp.size * z * 0.5)
            ctx.fillStyle = sp.rainbow ? '#FFFFFF' : 'rgba(255,255,255,0.85)'
            ctx.fillRect(this.ox + x * z + sp.px * z, this.oy + y * z + sp.py * z, r, r)
          }
        }
      }
    }

    // 3. 跟拼遮罩：拼过的变淡，非当前色的也压暗
    const guide = this.guide
    const dim = 'rgba(251,247,241,0.62)'
    if (guide.mode && (guide.done || guide.colorId)) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * g.width + x
          const v = g.data[i]
          if (!v) continue
          let fade = false
          if (guide.done && guide.done[i]) fade = true
          if (guide.colorId && v !== guide.colorId) fade = true
          if (fade) {
            ctx.fillStyle = dim
            ctx.fillRect(this.ox + x * z, this.oy + y * z, half, half)
          }
        }
      }
    }

    // 4. 网格线（放大到看得清才画，否则一片糊）
    if (z >= 4) {
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = x0; x <= x1 + 1; x++) {
        const px = Math.round(this.ox + x * z) + 0.5
        ctx.moveTo(px, this.oy + y0 * z)
        ctx.lineTo(px, this.oy + (y1 + 1) * z)
      }
      for (let y = y0; y <= y1 + 1; y++) {
        const py = Math.round(this.oy + y * z) + 0.5
        ctx.moveTo(this.ox + x0 * z, py)
        ctx.lineTo(this.ox + (x1 + 1) * z, py)
      }
      ctx.strokeStyle = LINE
      ctx.stroke()

      // 每 10 格加粗，方便数格子
      if (z >= 6) {
        ctx.beginPath()
        for (let x = Math.ceil(x0 / 10) * 10; x <= x1 + 1; x += 10) {
          const px = Math.round(this.ox + x * z) + 0.5
          ctx.moveTo(px, this.oy + y0 * z)
          ctx.lineTo(px, this.oy + (y1 + 1) * z)
        }
        for (let y = Math.ceil(y0 / 10) * 10; y <= y1 + 1; y += 10) {
          const py = Math.round(this.oy + y * z) + 0.5
          ctx.moveTo(this.ox + x0 * z, py)
          ctx.lineTo(this.ox + (x1 + 1) * z, py)
        }
        ctx.strokeStyle = LINE_STRONG
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }

    // 5. 色号
    if (this.showNumbers && z >= 18) {
      ctx.fillStyle = INK
      ctx.font = `${Math.min(14, Math.max(7, z * 0.42))}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const v = g.data[y * g.width + x]
          if (!v) continue
          ctx.fillText(CODE.get(v) || '', this.ox + (x + 0.5) * z, this.oy + (y + 0.5) * z)
        }
      }
    }

    // 6. 分步引导的光标圈
    if (guide.focus) {
      const cx = this.ox + (guide.focus.x + 0.5) * z
      const cy = this.oy + (guide.focus.y + 0.5) * z
      ctx.strokeStyle = '#C97B5A'
      ctx.lineWidth = Math.max(2, z * 0.12)
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(9, z * 0.62), 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

module.exports = { Renderer, MIN_ZOOM, MAX_ZOOM }
