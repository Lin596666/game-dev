import { describe, expect, it } from 'vitest'
import { COLORS } from './colors'
import { BeadGrid, EMPTY } from './grid'
import { UndoStack, diffSnapshot } from './history'
import { LIBRARY } from './library'
import { fitToColorSet, fitToColors } from './palette'
import { colorUsage, instructionText, totalBeads } from './pattern'
import { gridPhysicalInfo, physicalInfo, printLayout } from './physical'
import { planPrint } from './print'
import { createProjectFile, parseProjectFile, parseProjectText } from './project'
import { purchaseText, stockReport } from './stock'
import { nextRestIn, restMilestone } from './session'
import { decodeShare, encodeShare, shareCodeFromUrl, shareUrl } from './share'

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

describe('内置图纸库', () => {
  const ids = new Set(COLORS.map((c) => c.id))
  for (const p of LIBRARY) {
    it(`${p.id} 能生成有效图纸`, () => {
      const g = p.build()
      expect(g.width).toBe(p.size)
      expect(g.height).toBe(p.size)
      expect(totalBeads(g)).toBeGreaterThan(p.size * p.size * 0.1)
      expect(totalBeads(g)).toBeLessThan(p.size * p.size)
      for (let i = 0; i < g.data.length; i++) {
        const v = g.data[i]
        if (v === EMPTY) continue
        expect(ids.has(v)).toBe(true)
      }
    })
  }
})

describe('实物尺寸与打印排版', () => {
  it('29×29 是 14.5cm、一块豆板、一页纸', () => {
    const info = physicalInfo(29, 29)
    expect(info.widthCm).toBe(14.5)
    expect(info.heightCm).toBe(14.5)
    expect(info.boards).toBe(1)
    expect(info.pages).toBe(1)
  })

  it('58×29 需要两块豆板', () => {
    const info = physicalInfo(58, 29)
    expect(info.boardsX).toBe(2)
    expect(info.boardsY).toBe(1)
    expect(info.boards).toBe(2)
  })

  it('96×96 打印 12 页', () => {
    const layout = printLayout(96, 96)
    expect(layout.cols).toBe(31)
    expect(layout.rows).toBe(46)
    expect(layout.pages).toBe(12)
  })

  it('空网格也能算出合理值', () => {
    const g = new BeadGrid(1, 1)
    expect(gridPhysicalInfo(g).boards).toBe(1)
  })
})

describe('换色卡吸附', () => {
  it('吸附后所有格子都来自目标色卡', () => {
    const g = new BeadGrid(6, 4)
    const basicOnly = COLORS.filter((c) => c.set === 'basic')
    const candy = new Set(COLORS.filter((c) => c.set === 'candy').map((c) => c.id))
    for (let i = 0; i < g.data.length; i++) g.data[i] = basicOnly[i % basicOnly.length]!.id
    const res = fitToColorSet(g, 'candy')
    expect(res.colorsAfter).toBeGreaterThan(0)
    for (let i = 0; i < g.data.length; i++) {
      expect(candy.has(g.data[i]!)).toBe(true)
    }
  })

  it('同一种原色只换成同一种新色', () => {
    const g = new BeadGrid(6, 2)
    const src = COLORS.filter((c) => c.set === 'basic')[3]!.id
    for (let i = 0; i < g.data.length; i++) g.data[i] = src
    fitToColorSet(g, 'nature')
    const uniq = new Set(Array.from(g.data))
    expect(uniq.size).toBe(1)
  })

  it('只换成"我有的色号"里最接近的颜色', () => {
    const g = new BeadGrid(5, 1)
    const a = COLORS[0]!
    const b = COLORS[7]!
    const owned = [COLORS[20]!, COLORS[40]!]
    for (let i = 0; i < g.data.length; i++) g.data[i] = i % 2 === 0 ? a.id : b.id
    const res = fitToColors(g, owned)
    expect(res.changed).toBeGreaterThan(0)
    const allowed = new Set(owned.map((c) => c.id))
    for (let i = 0; i < g.data.length; i++) {
      expect(allowed.has(g.data[i]!)).toBe(true)
    }
  })
})

describe('旋转 90°', () => {
  it('宽高互换且位置正确', () => {
    const g = new BeadGrid(3, 2)
    g.set(0, 0, 1)
    g.set(2, 1, 2)
    const r = g.rotated90()
    expect(r.width).toBe(2)
    expect(r.height).toBe(3)
    expect(r.get(1, 0)).toBe(1)
    expect(r.get(0, 2)).toBe(2)
  })
})

describe('A4 打印分页', () => {
  it('29×29 一页就够，区域从左上角开始', () => {
    const plan = planPrint(29, 29)
    expect(plan.pages.length).toBe(1)
    expect(plan.pages[0]).toMatchObject({ x: 0, y: 0, cols: 29, rows: 29 })
  })

  it('96×96 会切成多页，最后一页只覆盖剩下的部分', () => {
    const plan = planPrint(96, 96)
    expect(plan.pages.length).toBe(plan.pagesX * plan.pagesY)
    expect(plan.pages.length).toBeGreaterThan(1)
    const last = plan.pages[plan.pages.length - 1]!
    expect(last.x + last.cols).toBe(96)
    expect(last.y + last.rows).toBe(96)
    // 每个格子都必须恰好落在一页里
    expect(plan.pages.reduce((sum, p) => sum + p.cols * p.rows, 0)).toBe(96 * 96)
  })
})

describe('豆子库存与采购清单', () => {
  it('算得出每种色还缺多少', () => {
    const g = new BeadGrid(4, 1)
    const a = COLORS[0]!.id
    const b = COLORS[1]!.id
    g.set(0, 0, a)
    g.set(1, 0, a)
    g.set(2, 0, b)
    const report = stockReport(g, { [a]: 5 })
    expect(report.totalNeed).toBe(3)
    expect(report.totalShort).toBe(1)
    expect(report.shortColors).toBe(1)
    expect(report.rows.find((r) => r.id === b)!.short).toBe(1)
    expect(report.rows.find((r) => r.id === a)!.short).toBe(0)
  })

  it('库存够时清单明确说不用买', () => {
    const g = new BeadGrid(2, 1)
    const a = COLORS[0]!.id
    g.set(0, 0, a)
    g.set(1, 0, a)
    const report = stockReport(g, { [a]: 100 })
    expect(purchaseText(report)).toContain('不用买')
  })

  it('清单只列缺的颜色', () => {
    const g = new BeadGrid(3, 1)
    const a = COLORS[0]!.id
    const b = COLORS[2]!.id
    g.set(0, 0, a)
    g.set(1, 0, b)
    g.set(2, 0, b)
    const text = purchaseText(stockReport(g, { [a]: 1 }), '测试图纸')
    expect(text).toContain('测试图纸')
    expect(text).toContain('缺 2 颗')
    expect(text).not.toContain(COLORS[0]!.code)
  })
})

describe('分享码', () => {
  it('编码再解码能还原格子和尺寸', () => {
    const g = new BeadGrid(9, 7)
    const a = COLORS[0]!.id
    const b = COLORS[5]!.id
    g.set(0, 0, a)
    g.set(1, 0, a)
    g.set(2, 0, a)
    g.set(8, 6, b)
    const code = encodeShare({ name: '', width: g.width, height: g.height, cells: g.data })
    const back = decodeShare(code)
    expect(back.width).toBe(9)
    expect(back.height).toBe(7)
    expect(Array.from(back.cells)).toEqual(Array.from(g.data))
  })

  it('大片同色会被压得很短', () => {
    const g = new BeadGrid(60, 60)
    g.fill(COLORS[2]!.id)
    const code = encodeShare({ name: '', width: g.width, height: g.height, cells: g.data })
    // 3600 格全同色，行程对只有 (3600, id) 两个变长整数
    expect(code.length).toBeLessThan(40)
  })

  it('坏掉的分享码会抛错', () => {
    expect(() => decodeShare('b1.3.3.!!!')).toThrow()
    expect(() => decodeShare('hello')).toThrow()
    expect(() => decodeShare('b1.0.3.abc')).toThrow()
  })

  it('链接里能取回分享码', () => {
    const code = encodeShare({
      name: '',
      width: 2,
      height: 2,
      cells: new Uint16Array([1, 1, 0, 0])
    })
    const url = shareUrl(code, 'https://example.com/game-dev/')
    expect(url.startsWith('https://example.com/game-dev/#p=')).toBe(true)
    expect(shareCodeFromUrl(new URL(url).hash)).toBe(code)
    expect(shareCodeFromUrl('#nothing=1')).toBe('')
  })
})

describe('久坐提醒', () => {
  it('还没到第一轮时不提醒', () => {
    expect(restMilestone(0)).toBe(0)
    expect(restMilestone(44)).toBe(0)
  })

  it('到点后返回跨过的整点，整轮内保持不变', () => {
    expect(restMilestone(45)).toBe(45)
    expect(restMilestone(70)).toBe(45)
    expect(restMilestone(90)).toBe(90)
  })

  it('距离下次提醒的分钟数', () => {
    expect(nextRestIn(0)).toBe(45)
    expect(nextRestIn(20)).toBe(25)
    expect(nextRestIn(45)).toBe(45)
    expect(nextRestIn(46)).toBe(44)
  })

  it('可以自定义间隔', () => {
    expect(restMilestone(59, 30)).toBe(30)
    expect(nextRestIn(59, 30)).toBe(1)
  })
})

