import { colorById, type BeadColor } from './colors'
import { EMPTY } from './grid'
import type { BeadGrid } from './grid'

/** 图纸统计与「跟拼」所需的派生数据 */

export interface ColorUsage {
  id: number
  color: BeadColor
  count: number
}

export function colorUsage(grid: BeadGrid): ColorUsage[] {
  const out: ColorUsage[] = []
  for (const [id, count] of grid.countByColor()) {
    const color = colorById(id)
    if (color) out.push({ id, color, count })
  }
  return out.sort((a, b) => b.count - a.count)
}

export function totalBeads(grid: BeadGrid): number {
  return grid.usedCount()
}

/** 估个价：拼豆常见单价 0.01~0.05 元/颗，默认 0.03 */
export function estimateCost(beads: number, pricePerBead = 0.03): number {
  return Math.round(beads * pricePerBead * 100) / 100
}

export interface RowRun {
  start: number
  length: number
  id: number
  color: BeadColor
}

export interface InstructionRow {
  row: number
  runs: RowRun[]
}

/**
 * 逐行说明书：把每行压成「从第几格起、连续几颗、什么色」。
 * 打印出来比纯图纸更好跟，尤其适合第一次拼的人。
 */
export function instructionRows(grid: BeadGrid): InstructionRow[] {
  const rows: InstructionRow[] = []
  for (let y = 0; y < grid.height; y++) {
    const runs: RowRun[] = []
    let x = 0
    while (x < grid.width) {
      const id = grid.get(x, y)
      if (id === EMPTY) {
        x++
        continue
      }
      let len = 1
      while (x + len < grid.width && grid.get(x + len, y) === id) len++
      const color = colorById(id)
      if (color) runs.push({ start: x + 1, length: len, id, color })
      x += len
    }
    if (runs.length) rows.push({ row: y + 1, runs })
  }
  return rows
}

/** 说明书文本（导出 .txt / 复制） */
export function instructionText(grid: BeadGrid, name = '拼豆图纸'): string {
  const lines: string[] = []
  const beads = totalBeads(grid)
  lines.push(`${name}　${grid.width} × ${grid.height}`)
  lines.push(`总豆数：${beads} 颗　用色：${colorUsage(grid).length} 色`)
  lines.push('')
  lines.push('【色号清单】')
  for (const u of colorUsage(grid)) {
    lines.push(`${u.color.code} ${u.color.name} ${u.color.hex}　${u.count} 颗`)
  }
  lines.push('')
  lines.push('【逐行说明】')
  for (const row of instructionRows(grid)) {
    const parts = row.runs.map((r) => `${r.start}号起${r.length}颗${r.color.code}`).join('，')
    lines.push(`第 ${row.row} 行：${parts}`)
  }
  return lines.join('\n')
}

/** 色块区域：把网格按连通同色块切开，跟拼时可以「一块一块拼」 */
export interface ColorRegion {
  id: number
  color: BeadColor
  cells: Array<{ x: number; y: number }>
  bounds: { x: number; y: number; w: number; h: number }
}

export function colorRegions(grid: BeadGrid, minSize = 1): ColorRegion[] {
  const { width: w, height: h } = grid
  const seen = new Uint8Array(w * h)
  const regions: ColorRegion[] = []

  const push = (id: number, cells: Array<{ x: number; y: number }>, color: BeadColor) => {
    if (cells.length < minSize) return
    let minX = w
    let minY = h
    let maxX = -1
    let maxY = -1
    for (const c of cells) {
      if (c.x < minX) minX = c.x
      if (c.y < minY) minY = c.y
      if (c.x > maxX) maxX = c.x
      if (c.y > maxY) maxY = c.y
    }
    regions.push({
      id,
      color,
      cells,
      bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
    })
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (seen[i]) continue
      const id = grid.get(x, y)
      seen[i] = 1
      if (id === EMPTY) continue
      const color = colorById(id)
      if (!color) continue

      const cells: Array<{ x: number; y: number }> = []
      const stack = [i]
      while (stack.length) {
        const cur = stack.pop()!
        const cx = cur % w
        const cy = (cur - cx) / w
        cells.push({ x: cx, y: cy })
        const neighbors = [
          cx > 0 ? cur - 1 : -1,
          cx < w - 1 ? cur + 1 : -1,
          cy > 0 ? cur - w : -1,
          cy < h - 1 ? cur + w : -1
        ]
        for (const n of neighbors) {
          if (n < 0 || seen[n]) continue
          if (grid.data[n] !== id) continue
          seen[n] = 1
          stack.push(n)
        }
      }
      push(id, cells, color)
    }
  }

  return regions.sort((a, b) => b.cells.length - a.cells.length)
}
