import type { BeadGrid } from './grid'

/**
 * 撤销栈：按「笔画」记录，一笔无论涂多少格都只占一步。
 * 每步只存变化区域的矩形切片，而不是全图快照，内存可控。
 */

export interface Patch {
  x: number
  y: number
  w: number
  h: number
  before: Uint16Array
  after: Uint16Array
}

/** 比较两份快照，提取最小差异矩形；无变化返回 null */
export function diffSnapshot(
  before: Uint16Array,
  after: Uint16Array,
  width: number,
  height: number
): Patch | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (before[row + x] !== after[row + x]) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) return null

  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const beforeCrop = new Uint16Array(w * h)
  const afterCrop = new Uint16Array(w * h)

  for (let y = 0; y < h; y++) {
    const src = (minY + y) * width + minX
    const dst = y * w
    beforeCrop.set(before.subarray(src, src + w), dst)
    afterCrop.set(after.subarray(src, src + w), dst)
  }

  return { x: minX, y: minY, w, h, before: beforeCrop, after: afterCrop }
}

export class UndoStack {
  private undoList: Patch[] = []
  private redoList: Patch[] = []
  limit: number
  /** 每次变更自增，方便 UI 响应 canUndo/canRedo */
  version = 0

  constructor(limit = 80) {
    this.limit = limit
  }

  get canUndo(): boolean {
    return this.undoList.length > 0
  }

  get canRedo(): boolean {
    return this.redoList.length > 0
  }

  get undoDepth(): number {
    return this.undoList.length
  }

  get redoDepth(): number {
    return this.redoList.length
  }

  push(patch: Patch): void {
    this.undoList.push(patch)
    if (this.undoList.length > this.limit) this.undoList.shift()
    this.redoList.length = 0
    this.version++
  }

  undo(grid: BeadGrid): boolean {
    const patch = this.undoList.pop()
    if (!patch) return false
    grid.blitRect(patch.x, patch.y, patch.w, patch.h, patch.before)
    this.redoList.push(patch)
    this.version++
    return true
  }

  redo(grid: BeadGrid): boolean {
    const patch = this.redoList.pop()
    if (!patch) return false
    grid.blitRect(patch.x, patch.y, patch.w, patch.h, patch.after)
    this.undoList.push(patch)
    this.version++
    return true
  }

  clear(): void {
    this.undoList.length = 0
    this.redoList.length = 0
    this.version++
  }
}

/**
 * 一次「按下 → 拖动 → 抬起」的会话记录器。
 * 用法：begin(grid) → 期间随便改 grid → commit() 得到 Patch。
 */
export class StrokeSession {
  private before: Uint16Array
  private width: number
  private height: number
  private closed = false

  constructor(private grid: BeadGrid) {
    this.before = grid.snapshot()
    this.width = grid.width
    this.height = grid.height
  }

  commit(): Patch | null {
    if (this.closed) return null
    this.closed = true
    return diffSnapshot(this.before, this.grid.data, this.width, this.height)
  }
}
