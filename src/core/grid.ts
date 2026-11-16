/**
 * 网格数据层（纯 TS，零 DOM 依赖）
 *
 * 存储：Uint16Array，每格一个色号；0 = 空位，其余是 COLORS[id-1]。
 * 这里刻意不使用任何对象/数组嵌套，十万格也只是 200KB 连续内存，重绘和撤销都快。
 */

export const EMPTY = 0

export class BeadGrid {
  readonly width: number
  readonly height: number
  data: Uint16Array
  /** 自增版本号，渲染器据此判断是否需要重建位图 */
  version = 0

  constructor(width: number, height: number, data?: Uint16Array) {
    if (width <= 0 || height <= 0) throw new Error('网格尺寸必须大于 0')
    this.width = width
    this.height = height
    this.data = data && data.length === width * height ? data : new Uint16Array(width * height)
  }

  get length(): number {
    return this.width * this.height
  }

  index(x: number, y: number): number {
    return y * this.width + x
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }

  get(x: number, y: number): number {
    if (!this.inBounds(x, y)) return EMPTY
    return this.data[this.index(x, y)]!
  }

  /** 返回是否真的发生了变化，便于撤销栈判断 */
  set(x: number, y: number, color: number): boolean {
    if (!this.inBounds(x, y)) return false
    const i = this.index(x, y)
    if (this.data[i] === color) return false
    this.data[i] = color
    return true
  }

  fill(color: number): void {
    this.data.fill(color)
    this.version++
  }

  clear(): void {
    this.fill(EMPTY)
  }

  isEmpty(): boolean {
    return this.data.every((v) => v === EMPTY)
  }

  /** 已放置的珠子数量 */
  usedCount(): number {
    let n = 0
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== EMPTY) n++
    return n
  }

  countByColor(): Map<number, number> {
    const map = new Map<number, number>()
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i]!
      if (v === EMPTY) continue
      map.set(v, (map.get(v) ?? 0) + 1)
    }
    return map
  }

  clone(): BeadGrid {
    const g = new BeadGrid(this.width, this.height, this.data.slice())
    g.version = this.version
    return g
  }

  snapshot(): Uint16Array {
    return this.data.slice()
  }

  restore(snapshot: Uint16Array): void {
    if (snapshot.length !== this.data.length) throw new Error('快照尺寸不匹配')
    this.data.set(snapshot)
    this.version++
  }

  /** 四个顶点确定的矩形区域（含端点），自动裁剪到边界 */
  extractRect(x0: number, y0: number, w: number, h: number): Uint16Array {
    const out = new Uint16Array(w * h)
    for (let y = 0; y < h; y++) {
      const sy = y0 + y
      for (let x = 0; x < w; x++) {
        const sx = x0 + x
        out[y * w + x] = this.inBounds(sx, sy) ? this.data[this.index(sx, sy)]! : EMPTY
      }
    }
    return out
  }

  blitRect(x0: number, y0: number, w: number, h: number, region: Uint16Array): void {
    for (let y = 0; y < h; y++) {
      const sy = y0 + y
      for (let x = 0; x < w; x++) {
        const sx = x0 + x
        if (!this.inBounds(sx, sy)) continue
        this.data[this.index(sx, sy)] = region[y * w + x]!
      }
    }
    this.version++
  }

  /** 油漆桶：四连通，遇到不同色停止 */
  floodFill(x: number, y: number, color: number): number {
    if (!this.inBounds(x, y)) return 0
    const target = this.get(x, y)
    if (target === color) return 0

    let changed = 0
    const stack: number[] = [this.index(x, y)]
    const seen = new Uint8Array(this.data.length)

    while (stack.length) {
      const i = stack.pop()!
      if (seen[i]) continue
      if (this.data[i] !== target) continue
      seen[i] = 1
      this.data[i] = color
      changed++

      const cx = i % this.width
      const cy = (i - cx) / this.width
      if (cx > 0) stack.push(i - 1)
      if (cx < this.width - 1) stack.push(i + 1)
      if (cy > 0) stack.push(i - this.width)
      if (cy < this.height - 1) stack.push(i + this.width)
    }

    if (changed) this.version++
    return changed
  }

  setFat(x: number, y: number, color: number, size: number): number {
    let changed = 0
    const r = Math.floor((size - 1) / 2)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (this.set(x + dx, y + dy, color)) changed++
      }
    }
    return changed
  }

  line(x0: number, y0: number, x1: number, y1: number, color: number, size = 1): number {
    let changed = 0
    let dx = Math.abs(x1 - x0)
    let dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    let x = x0
    let y = y0

    for (;;) {
      changed += this.setFat(x, y, color, size)
      if (x === x1 && y === y1) break
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x += sx
      }
      if (e2 <= dx) {
        err += dx
        y += sy
      }
    }
    if (changed) this.version++
    return changed
  }

  rect(x0: number, y0: number, x1: number, y1: number, color: number, filled: boolean, size = 1): number {
    const minX = Math.min(x0, x1)
    const maxX = Math.max(x0, x1)
    const minY = Math.min(y0, y1)
    const maxY = Math.max(y0, y1)
    let changed = 0

    if (filled) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.setFat(x, y, color, size)) changed++
        }
      }
    } else {
      changed += this.line(minX, minY, maxX, minY, color, size)
      changed += this.line(maxX, minY, maxX, maxY, color, size)
      changed += this.line(maxX, maxY, minX, maxY, color, size)
      changed += this.line(minX, maxY, minX, minY, color, size)
    }

    if (changed) this.version++
    return changed
  }

  ellipse(x0: number, y0: number, x1: number, y1: number, color: number, filled: boolean, size = 1): number {
    const minX = Math.min(x0, x1)
    const maxX = Math.max(x0, x1)
    const minY = Math.min(y0, y1)
    const maxY = Math.max(y0, y1)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const rx = Math.max((maxX - minX) / 2, 0.5)
    const ry = Math.max((maxY - minY) / 2, 0.5)

    let changed = 0
    const inside = (x: number, y: number) => {
      const nx = (x - cx) / rx
      const ny = (y - cy) / ry
      return nx * nx + ny * ny <= 1.001
    }

    if (filled) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (inside(x, y) && this.setFat(x, y, color, size)) changed++
        }
      }
    } else {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (!inside(x, y)) continue
          const edge =
            !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)
          if (edge && this.setFat(x, y, color, size)) changed++
        }
      }
    }

    if (changed) this.version++
    return changed
  }

  /** 全图替换某个色号（换色/批量替换） */
  replaceColor(from: number, to: number): number {
    let changed = 0
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] === from) {
        this.data[i] = to
        changed++
      }
    }
    if (changed) this.version++
    return changed
  }

  /** 水平/垂直/对角翻转 */
  transform(kind: 'flipX' | 'flipY' | 'rotate180'): void {
    const { width: w, height: h } = this
    const src = this.data.slice()
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const from =
          kind === 'flipX'
            ? src[y * w + (w - 1 - x)]!
            : kind === 'flipY'
              ? src[(h - 1 - y) * w + x]!
              : src[(h - 1 - y) * w + (w - 1 - x)]!
        this.data[y * w + x] = from
      }
    }
    this.version++
  }

  /** 顺时针旋转 90°：宽高互换，返回新网格（原网格不动） */
  rotated90(): BeadGrid {
    const g = new BeadGrid(this.height, this.width)
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        g.data[x * g.width + (this.height - 1 - y)] = this.data[y * this.width + x]!
      }
    }
    g.version++
    return g
  }

  /** 裁切（用于「按内容裁切」） */
  trimmed(): BeadGrid {
    let minX = this.width
    let minY = this.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.data[this.index(x, y)] !== EMPTY) {
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return this.clone()
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    return new BeadGrid(w, h, this.extractRect(minX, minY, w, h))
  }
}
