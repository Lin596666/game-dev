import { colorById, inkOn } from '@/core/colors'
import { EMPTY, type BeadGrid } from '@/core/grid'
import { RAINBOW_COLORS, finishById, sparkleAt, type IronFinishId } from '@/core/iron'
import { colorUsage, totalBeads } from '@/core/pattern'

/** 导出：PNG（纯净 / 网格 / 编号）、色号清单 CSV */

export interface ExportPngOptions {
  pxPerCell: number
  showGrid: boolean
  showNumbers: boolean
  withLegend: boolean
  transparent: boolean
  crop: boolean
  paperColor: string
  name: string
  /** 烫法：熨过的成品会多一圈高光和闪粉 */
  finish?: IronFinishId
}

export interface ExportResult {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

const LEGEND_ROW = 26
const PADDING = 24

function cropBounds(grid: BeadGrid): { x: number; y: number; w: number; h: number } {
  let minX = grid.width
  let minY = grid.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.get(x, y) !== EMPTY) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: grid.width, h: grid.height }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

export function renderPng(grid: BeadGrid, options: ExportPngOptions): ExportResult {
  const c = options.crop ? cropBounds(grid) : { x: 0, y: 0, w: grid.width, h: grid.height }
  const px = Math.max(4, Math.round(options.pxPerCell))
  const usage = colorUsage(grid)
  const legendH = options.withLegend ? usage.length * LEGEND_ROW + 40 : 0

  const width = c.w * px + PADDING * 2
  const height = c.h * px + PADDING * 2 + legendH

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('导出失败：无法创建画布')

  if (!options.transparent) {
    ctx.fillStyle = options.paperColor
    ctx.fillRect(0, 0, width, height)
  }

  const originX = PADDING
  const originY = PADDING

  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const id = grid.get(c.x + x, c.y + y)
      if (id === EMPTY) continue
      const color = colorById(id)
      if (!color) continue
      ctx.fillStyle = color.hex
      ctx.fillRect(originX + x * px, originY + y * px, px, px)
    }
  }

  // 熨过的成品：每颗压成方糖状（上亮下暗），带闪粉的再撒一层亮点
  const finish = options.finish ? finishById(options.finish) : null
  if (finish && finish.ironed) {
    const pad = Math.max(0.5, px * 0.07)
    const light = new Path2D()
    const dark = new Path2D()
    const plain = new Path2D()
    const rainbow = RAINBOW_COLORS.map(() => new Path2D())
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        if (grid.get(c.x + x, c.y + y) === EMPTY) continue
        const bx = originX + x * px
        const by = originY + y * px
        light.moveTo(bx + pad, by + px - pad)
        light.lineTo(bx + pad, by + pad)
        light.lineTo(bx + px - pad, by + pad)
        dark.moveTo(bx + pad, by + px - pad)
        dark.lineTo(bx + px - pad, by + px - pad)
        dark.lineTo(bx + px - pad, by + pad)
        const sp = sparkleAt(x, y, finish)
        if (!sp.on) continue
        const cx = bx + sp.px * px
        const cy = by + sp.py * px
        const r = Math.max(0.6, sp.size * px * 0.5)
        const path = finish.rainbow ? rainbow[sp.hue]! : plain
        path.moveTo(cx + r, cy)
        path.arc(cx, cy, r, 0, Math.PI * 2)
      }
    }
    ctx.save()
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = Math.max(1, px * 0.055)
    ctx.stroke(light)
    ctx.strokeStyle = 'rgba(58, 52, 46, 0.10)'
    ctx.lineWidth = Math.max(1, px * 0.05)
    ctx.stroke(dark)
    if (finish.rainbow) {
      rainbow.forEach((path, i) => {
        ctx.globalAlpha = 0.9
        ctx.fillStyle = RAINBOW_COLORS[i]!
        ctx.fill(path)
      })
      ctx.globalAlpha = 1
    } else if (finish.sparkle > 0) {
      ctx.globalAlpha = 0.8
      ctx.fillStyle = '#FFFFFF'
      ctx.fill(plain)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  if (options.showGrid && px >= 6) {    ctx.save()
    ctx.strokeStyle = 'rgba(74, 60, 46, 0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= c.w; x++) {
      const gx = Math.round(originX + x * px) + 0.5
      ctx.moveTo(gx, originY)
      ctx.lineTo(gx, originY + c.h * px)
    }
    for (let y = 0; y <= c.h; y++) {
      const gy = Math.round(originY + y * px) + 0.5
      ctx.moveTo(originX, gy)
      ctx.lineTo(originX + c.w * px, gy)
    }
    ctx.stroke()
    ctx.restore()
  }

  if (options.showNumbers && px >= 16) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${Math.round(px * 0.34)}px ui-monospace, Menlo, monospace`
    let ink = ''
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const id = grid.get(c.x + x, c.y + y)
        if (id === EMPTY) continue
        const color = colorById(id)
        if (!color) continue
        const next = inkOn(color.hex)
        if (next !== ink) {
          ctx.fillStyle = next
          ink = next
        }
        ctx.fillText(color.code, originX + x * px + px / 2, originY + y * px + px / 2 + 1)
      }
    }
    ctx.restore()
  }

  // 行列标号
  if (px >= 10) {
    ctx.save()
    ctx.fillStyle = 'rgba(120, 106, 92, 0.9)'
    ctx.font = '500 10px ui-monospace, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    for (let x = 0; x < c.w; x++) {
      if ((x + 1) % 5 !== 0) continue
      ctx.fillText(String(x + 1), originX + x * px + px / 2, originY - 4)
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let y = 0; y < c.h; y++) {
      if ((y + 1) % 5 !== 0) continue
      ctx.fillText(String(y + 1), originX - 4, originY + y * px + px / 2)
    }
    ctx.restore()
  }

  if (options.withLegend) {
    const baseY = originY + c.h * px + 28
    ctx.save()
    ctx.font = '600 13px system-ui, "PingFang SC", sans-serif'
    ctx.fillStyle = '#3A342E'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${options.name}　${c.w}×${c.h}　共 ${totalBeads(grid)} 颗`, PADDING, baseY - 14)

    ctx.font = '500 12px ui-monospace, Menlo, monospace'
    usage.forEach((u, i) => {
      const y = baseY + 10 + i * LEGEND_ROW
      ctx.fillStyle = u.color.hex
      ctx.fillRect(PADDING, y, 16, 16)
      ctx.strokeStyle = 'rgba(74, 60, 46, 0.2)'
      ctx.lineWidth = 1
      ctx.strokeRect(PADDING + 0.5, y + 0.5, 16, 16)
      ctx.fillStyle = '#3A342E'
      ctx.fillText(
        `${u.color.code}  ${u.color.name.padEnd(6, ' ')}  ×${u.count}`,
        PADDING + 26,
        y + 8
      )
    })
    ctx.restore()
  }

  return { canvas, width, height }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('导出失败'))
    }, type)
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadText(text: string, filename: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type }), filename)
}

/** 缩略图（工程列表用） */
export function renderThumbnail(grid: BeadGrid, size = 220): string {
  const c = cropBounds(grid)
  const px = Math.max(1, Math.floor(size / Math.max(c.w, c.h)))
  const w = c.w * px
  const h = c.h * px
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, w)
  canvas.height = Math.max(1, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#FBF7F1'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const id = grid.get(c.x + x, c.y + y)
      if (id === EMPTY) continue
      const color = colorById(id)
      if (!color) continue
      ctx.fillStyle = color.hex
      ctx.fillRect(x * px, y * px, px, px)
    }
  }
  return canvas.toDataURL('image/png')
}

export interface ShareCardOptions {
  name: string
  beads: number
  width: number
  height: number
  finishName?: string
  paperColor?: string
}

export interface ShareCardResult {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

/**
 * 分享卡片：1080×1350（4:5，朋友圈/小红书都合适）。
 * 纸底 + 白卡 + 居中作品 + 名字与颗数，右下角一行小字署名。
 */
export function renderShareCard(grid: BeadGrid, options: ShareCardOptions): ShareCardResult {
  const W = 1080
  const H = 1350
  const paper = options.paperColor ?? '#FBF7F1'

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('导出失败：无法创建画布')

  ctx.fillStyle = paper
  ctx.fillRect(0, 0, W, H)

  // 四角柔和的暖色晕，让纸看起来有厚度
  const glow = ctx.createRadialGradient(W / 2, 260, 80, W / 2, 260, 900)
  glow.addColorStop(0, 'rgba(255, 253, 248, 0.95)')
  glow.addColorStop(1, 'rgba(251, 247, 241, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // 白卡
  const cardX = 64
  const cardY = 64
  const cardW = W - cardX * 2
  const cardH = H - cardY * 2
  ctx.save()
  ctx.shadowColor = 'rgba(122, 103, 84, 0.16)'
  ctx.shadowBlur = 48
  ctx.shadowOffsetY = 18
  ctx.fillStyle = '#FFFDFA'
  roundRect(ctx, cardX, cardY, cardW, cardH, 40)
  ctx.fill()
  ctx.restore()

  // 作品：按内容裁切后居中，最大 760px
  const c = cropBounds(grid)
  const px = Math.max(2, Math.floor(760 / Math.max(c.w, c.h)))
  const artW = c.w * px
  const artH = c.h * px
  const artX = Math.round((W - artW) / 2)
  const artY = Math.round(cardY + 150 + (760 - artH) / 2)

  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const id = grid.get(c.x + x, c.y + y)
      if (id === EMPTY) continue
      const color = colorById(id)
      if (!color) continue
      ctx.fillStyle = color.hex
      ctx.fillRect(artX + x * px, artY + y * px, px, px)
    }
  }

  // 标题与统计
  ctx.textAlign = 'center'
  ctx.fillStyle = '#3A342E'
  ctx.font = '600 52px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif SC", serif'
  ctx.fillText(options.name || '拼豆作品', W / 2, cardY + 92)

  const bits = [`${options.width}×${options.height}`, `${options.beads} 颗`]
  if (options.finishName) bits.push(options.finishName)
  ctx.fillStyle = '#8C8378'
  ctx.font = '400 30px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(bits.join(' · '), W / 2, cardY + 136)

  ctx.fillStyle = '#B3AA9E'
  ctx.font = '400 24px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('拼豆工房 · Bead Atelier', W / 2, cardY + cardH - 56)

  return { canvas, width: W, height: H }
}

/**
 * 挂墙效果图：把作品装进木框，挂在墙上拍一张「成品照」。
 * 用来分享"我真的把它做出来了"这件事，比纯图纸更有成就感。
 */
export function renderWallShot(grid: BeadGrid, options: ShareCardOptions): ShareCardResult {
  const W = 1080
  const H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('导出失败：无法创建画布')

  // 墙：暖米色 + 木纹横条
  const wall = ctx.createLinearGradient(0, 0, 0, H)
  wall.addColorStop(0, '#F4EADB')
  wall.addColorStop(0.55, '#EBDFCB')
  wall.addColorStop(1, '#E1D2B9')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, W, H)
  for (let y = 0; y < H; y += 132) {
    ctx.fillStyle = 'rgba(150, 122, 86, 0.06)'
    ctx.fillRect(0, y, W, 3)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.fillRect(0, y + 3, W, 2)
  }
  const light = ctx.createRadialGradient(W * 0.5, 180, 60, W * 0.5, 180, 780)
  light.addColorStop(0, 'rgba(255, 250, 238, 0.75)')
  light.addColorStop(1, 'rgba(255, 250, 238, 0)')
  ctx.fillStyle = light
  ctx.fillRect(0, 0, W, H)

  // 内容尺寸
  const c = cropBounds(grid)
  const inner = 700
  const px = Math.max(2, Math.floor(inner / Math.max(c.w, c.h)))
  const artW = c.w * px
  const artH = c.h * px
  const artX = Math.round((W - artW) / 2)
  const artY = Math.round(300 + (inner - artH) / 2)

  const framePad = 40
  const frameX = artX - framePad
  const frameY = artY - framePad
  const frameW = artW + framePad * 2
  const frameH = artH + framePad * 2

  ctx.save()
  ctx.shadowColor = 'rgba(96, 74, 48, 0.35)'
  ctx.shadowBlur = 46
  ctx.shadowOffsetY = 20
  ctx.fillStyle = '#C8A277'
  roundRect(ctx, frameX, frameY, frameW, frameH, 8)
  ctx.fill()
  ctx.restore()

  // 木框：斜向渐变 + 内倒角
  const wood = ctx.createLinearGradient(frameX, frameY, frameX + frameW, frameY + frameH)
  wood.addColorStop(0, '#D8B78F')
  wood.addColorStop(0.45, '#C29A6C')
  wood.addColorStop(1, '#A97F53')
  ctx.fillStyle = wood
  roundRect(ctx, frameX, frameY, frameW, frameH, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 250, 240, 0.5)'
  ctx.lineWidth = 3
  roundRect(ctx, frameX + 4, frameY + 4, frameW - 8, frameH - 8, 6)
  ctx.stroke()

  // 卡纸
  ctx.fillStyle = '#FFFDF8'
  ctx.fillRect(artX - 14, artY - 14, artW + 28, artH + 28)

  // 作品
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const id = grid.get(c.x + x, c.y + y)
      if (id === EMPTY) continue
      const color = colorById(id)
      if (!color) continue
      ctx.fillStyle = color.hex
      ctx.fillRect(artX + x * px, artY + y * px, px, px)
    }
  }

  // 玻璃反光
  const glass = ctx.createLinearGradient(artX, artY, artX + artW * 0.7, artY + artH)
  glass.addColorStop(0, 'rgba(255, 255, 255, 0.22)')
  glass.addColorStop(0.35, 'rgba(255, 255, 255, 0.04)')
  glass.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = glass
  ctx.fillRect(artX, artY, artW, artH)

  // 铜牌
  const plateW = Math.min(520, Math.max(340, artW * 0.62))
  const plateH = 104
  const plateX = Math.round((W - plateW) / 2)
  const plateY = frameY + frameH + 42
  const brass = ctx.createLinearGradient(plateX, plateY, plateX, plateY + plateH)
  brass.addColorStop(0, '#E7D2A8')
  brass.addColorStop(1, '#CFB181')
  ctx.fillStyle = brass
  roundRect(ctx, plateX, plateY, plateW, plateH, 10)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120, 96, 62, 0.35)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#4A3B2A'
  ctx.font = '600 40px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif SC", serif'
  ctx.fillText(options.name || '拼豆作品', W / 2, plateY + 50)
  const bits = [options.width + '×' + options.height, options.beads + ' 颗']
  if (options.finishName) bits.push(options.finishName)
  ctx.fillStyle = 'rgba(74, 59, 42, 0.72)'
  ctx.font = '400 24px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(bits.join(' · '), W / 2, plateY + 84)

  ctx.fillStyle = 'rgba(106, 92, 72, 0.55)'
  ctx.font = '400 24px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('拼豆工房 · Bead Atelier', W / 2, H - 64)

  return { canvas, width: W, height: H }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
