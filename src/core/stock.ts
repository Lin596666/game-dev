import type { BeadGrid } from './grid'
import { colorUsage } from './pattern'

/** 每种色号手上有多少颗，key 是颜色 id */
export type StockMap = Record<number, number>

export interface StockRow {
  id: number
  code: string
  name: string
  hex: string
  /** 图纸需要几颗 */
  need: number
  /** 手上有几颗 */
  have: number
  /** 还差几颗，0 表示够用 */
  short: number
}

export interface StockReport {
  rows: StockRow[]
  totalNeed: number
  totalShort: number
  /** 需要补货的颜色数 */
  shortColors: number
}

/**
 * 按图纸用量和手上的库存算缺多少豆子。
 *
 * 为什么值得算：拼豆最烦的是拼到一半发现某个颜色不够，
 * 而色卡一下单就是几百上千颗，先算清楚能省一次邮费。
 */
export function stockReport(grid: BeadGrid, stock: StockMap = {}, fallbackHave = 0): StockReport {
  const rows: StockRow[] = colorUsage(grid).map((u) => {
    const have = stock[u.id] ?? fallbackHave
    return {
      id: u.id,
      code: u.color.code,
      name: u.color.name,
      hex: u.color.hex,
      need: u.count,
      have,
      short: Math.max(0, u.count - have)
    }
  })
  return {
    rows,
    totalNeed: rows.reduce((s, r) => s + r.need, 0),
    totalShort: rows.reduce((s, r) => s + r.short, 0),
    shortColors: rows.filter((r) => r.short > 0).length
  }
}

/** 采购清单文本：直接发给卖家或者记在备忘录里 */
export function purchaseText(report: StockReport, docName = '拼豆图纸'): string {
  const short = report.rows.filter((r) => r.short > 0)
  const head = `${docName} · 采购清单`
  if (short.length === 0) return `${head}\n\n手上的豆子够拼这张图，不用买。\n`
  const lines = short.map((r) => `${r.code} ${r.name}  缺 ${r.short} 颗（共需 ${r.need}，手上 ${r.have}）`)
  return [
    head,
    '',
    ...lines,
    '',
    `合计：${short.length} 种颜色，${report.totalShort} 颗`
  ].join('\n')
}
