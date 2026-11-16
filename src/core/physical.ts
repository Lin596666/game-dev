import { BeadGrid } from './grid'

/** 一颗标准拼豆的直径（mm）。市面上绝大多数是 5mm，少数迷你款是 2.6mm */
export const BEAD_MM = 5

/** 常见方形豆板边长（格）。29×29 是最普遍的规格 */
export const BOARD_SIZE = 29

export interface PrintLayout {
  /** 打印时每格边长（mm） */
  cellMm: number
  pageW: number
  pageH: number
  margin: number
  /** 单页能放下几列/几行 */
  cols: number
  rows: number
  pagesX: number
  pagesY: number
  pages: number
}

export interface PhysicalInfo extends PrintLayout {
  widthMm: number
  heightMm: number
  widthCm: number
  heightCm: number
  /** 拼完需要几块豆板 */
  boardsX: number
  boardsY: number
  boards: number
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * A4 打印分页方案。
 * 为什么按 6mm 一格算：拼豆图纸打印出来要能对着数格子，
 * 5mm 太紧、8mm 一页放不下多少，6mm 是实测比较舒服的折中。
 */
export function printLayout(
  width: number,
  height: number,
  opts: { cellMm?: number; pageW?: number; pageH?: number; margin?: number } = {}
): PrintLayout {
  const cellMm = opts.cellMm ?? 6
  const pageW = opts.pageW ?? 210
  const pageH = opts.pageH ?? 297
  const margin = opts.margin ?? 10
  const usableW = pageW - margin * 2
  const usableH = pageH - margin * 2
  const cols = Math.max(1, Math.floor(usableW / cellMm))
  const rows = Math.max(1, Math.floor(usableH / cellMm))
  const pagesX = Math.max(1, Math.ceil(width / cols))
  const pagesY = Math.max(1, Math.ceil(height / rows))
  return {
    cellMm,
    pageW,
    pageH,
    margin,
    cols,
    rows,
    pagesX,
    pagesY,
    pages: pagesX * pagesY
  }
}

/** 一张图纸的实物信息：成品尺寸、要几块豆板、打印要几页 */
export function physicalInfo(
  width: number,
  height: number,
  opts: { beadMm?: number; board?: number } = {}
): PhysicalInfo {
  const beadMm = opts.beadMm ?? BEAD_MM
  const board = opts.board ?? BOARD_SIZE
  const widthMm = width * beadMm
  const heightMm = height * beadMm
  return {
    widthMm,
    heightMm,
    widthCm: round1(widthMm / 10),
    heightCm: round1(heightMm / 10),
    boardsX: Math.max(1, Math.ceil(width / board)),
    boardsY: Math.max(1, Math.ceil(height / board)),
    boards: Math.max(1, Math.ceil(width / board)) * Math.max(1, Math.ceil(height / board)),
    ...printLayout(width, height)
  }
}

/** 直接从网格拿实物信息，省得组件里到处传宽高 */
export function gridPhysicalInfo(grid: BeadGrid, opts?: { beadMm?: number; board?: number }): PhysicalInfo {
  return physicalInfo(grid.width, grid.height, opts)
}
