import { colorById, inkOn } from '@/core/colors'
import { EMPTY, type BeadGrid } from '@/core/grid'
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

  if (options.showGrid && px >= 6) {
    ctx.save()
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
