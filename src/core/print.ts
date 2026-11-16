import { printLayout } from './physical'

export interface PrintOptions {
  cellMm?: number
  pageW?: number
  pageH?: number
  margin?: number
}

/** 打印时一个 A4 页面负责画哪一块区域 */
export interface PrintPage {
  /** 从 0 开始的页序号 */
  index: number
  /** 区域左上角格坐标 */
  x: number
  y: number
  /** 区域宽度/高度（最后一页可能不满） */
  cols: number
  rows: number
}

export interface PrintPlan {
  /** 每页能放多少列 / 多少行 */
  cols: number
  rows: number
  pagesX: number
  pagesY: number
  pages: PrintPage[]
}

/**
 * 把一张图纸切成 A4 页。
 *
 * 为什么要切：拼豆图纸动辄 96×96，按 1:1 打印一张 A4 放不下，
 * 手作时的习惯做法是打成「第 1 页 行 1–46 列 1–31」这种拼块，
 * 摆在一起就是整张图。
 */
export function planPrint(width: number, height: number, opts: PrintOptions = {}): PrintPlan {
  const layout = printLayout(width, height, opts)
  const pages: PrintPage[] = []
  for (let py = 0; py < layout.pagesY; py++) {
    for (let px = 0; px < layout.pagesX; px++) {
      const x = px * layout.cols
      const y = py * layout.rows
      pages.push({
        index: pages.length,
        x,
        y,
        cols: Math.max(0, Math.min(layout.cols, width - x)),
        rows: Math.max(0, Math.min(layout.rows, height - y))
      })
    }
  }
  return { cols: layout.cols, rows: layout.rows, pagesX: layout.pagesX, pagesY: layout.pagesY, pages }
}
