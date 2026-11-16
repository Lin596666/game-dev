import { describe, expect, it } from 'vitest'
import { BeadGrid, EMPTY } from './grid'
import { UndoStack, diffSnapshot } from './history'
import { colorUsage, instructionText, totalBeads } from './pattern'
import { createProjectFile, parseProjectFile, parseProjectText } from './project'

describe('BeadGrid', () => {
  it('写入与读取', () => {
    const g = new BeadGrid(4, 3)
    expect(g.get(1, 1)).toBe(EMPTY)
    expect(g.set(1, 1, 5)).toBe(true)
    expect(g.get(1, 1)).toBe(5)
    expect(g.set(1, 1, 5)).toBe(false)
    expect(g.usedCount()).toBe(1)
  })

  it('越界读写是安全的', () => {
    const g = new BeadGrid(2, 2)
    expect(g.get(-1, 0)).toBe(EMPTY)
    expect(g.set(9, 9, 3)).toBe(false)
    expect(g.inBounds(1, 1)).toBe(true)
    expect(g.inBounds(2, 1)).toBe(false)
  })

  it('油漆桶只填连通区域', () => {
    const g = new BeadGrid(5, 5)
    // 竖着一条墙，把画面分成左右两半
    for (let y = 0; y < 5; y++) g.set(2, y, 1)
    const n = g.floodFill(0, 0, 7)
    expect(n).toBe(10)
    expect(g.get(1, 1)).toBe(7)
    expect(g.get(3, 3)).toBe(EMPTY)
  })

  it('直线与矩形', () => {
    const g = new BeadGrid(5, 5)
    g.line(0, 0, 4, 4, 2)
    expect(g.get(0, 0)).toBe(2)
    expect(g.get(2, 2)).toBe(2)
    expect(g.get(4, 4)).toBe(2)

    const h = new BeadGrid(5, 5)
    h.rect(0, 0, 4, 4, 3, false)
    expect(h.get(0, 0)).toBe(3)
    expect(h.get(2, 2)).toBe(EMPTY)
    expect(h.usedCount()).toBe(16)
  })

  it('翻转与裁边', () => {
    const g = new BeadGrid(3, 3)
    g.set(0, 0, 9)
    g.transform('flipX')
    expect(g.get(2, 0)).toBe(9)
    g.transform('flipY')
    expect(g.get(2, 2)).toBe(9)

    const big = new BeadGrid(6, 6)
    big.set(2, 2, 4)
    big.set(3, 3, 4)
    const t = big.trimmed()
    expect(t.width).toBe(2)
    expect(t.height).toBe(2)
    expect(t.get(0, 0)).toBe(4)
  })

  it('批量按色统计', () => {
    const g = new BeadGrid(4, 4)
    g.set(0, 0, 1)
    g.set(1, 0, 1)
    g.set(2, 0, 2)
    expect(g.countByColor().get(1)).toBe(2)
    expect(g.countByColor().get(2)).toBe(1)
  })
})

describe('撤销栈', () => {
  it('按笔画回退，只记录差异矩形', () => {
    const g = new BeadGrid(6, 6)
    g.set(1, 1, 3)
    const before = g.snapshot()
    g.set(2, 2, 4)
    g.set(3, 3, 4)
    const patch = diffSnapshot(before, g.data, 6, 6)
    expect(patch).not.toBeNull()
    expect(patch!.w).toBe(2)
    expect(patch!.h).toBe(2)

    const stack = new UndoStack(10)
    stack.push(patch!)
    expect(stack.canUndo).toBe(true)
    stack.undo(g)
    expect(g.get(2, 2)).toBe(EMPTY)
    expect(g.get(1, 1)).toBe(3)
    stack.redo(g)
    expect(g.get(2, 2)).toBe(4)
  })
})

describe('图纸统计', () => {
  it('按用量排序并生成说明文本', () => {
    const g = new BeadGrid(4, 4)
    g.set(0, 0, 1)
    g.set(1, 0, 2)
    g.set(2, 0, 2)
    g.set(3, 0, 2)
    const usage = colorUsage(g)
    expect(totalBeads(g)).toBe(4)
    expect(usage[0]!.count).toBe(3)

    const text = instructionText(g, '测试图纸')
    expect(text).toContain('测试图纸')
    expect(text).toContain('第 1 行')
  })
})

describe('工程文件', () => {
  it('存取一致', () => {
    const g = new BeadGrid(3, 2)
    g.set(0, 0, 7)
    g.set(2, 1, 9)
    const file = createProjectFile(g, { id: 'abc', name: '测试' })
    const parsed = parseProjectFile(JSON.parse(JSON.stringify(file)))
    expect(parsed.grid.width).toBe(3)
    expect(parsed.grid.height).toBe(2)
    expect(parsed.grid.get(0, 0)).toBe(7)
    expect(parsed.grid.get(2, 1)).toBe(9)
    expect(parsed.name).toBe('测试')
  })

  it('拒绝损坏的文件', () => {
    expect(() => parseProjectText('not json')).toThrow()
    expect(() => parseProjectFile({ v: 999 })).toThrow()
  })
})
