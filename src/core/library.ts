import { COLORS, colorByHex } from './colors'
import { BeadGrid } from './grid'

/**
 * 内置图纸库（程序化生成，保证线条干净、尺寸规整）
 *
 * 都是「数学判定 + 上色」得到的，没有依赖任何图片资源，离线也能用。
 * 新手可以直接打开一张来跟拼。
 */

export interface LibraryPattern {
  id: string
  name: string
  desc: string
  size: number
  build: () => BeadGrid
}

function pick(hex: string): number {
  const c = colorByHex(hex)
  return c ? c.id : (COLORS[0]?.id ?? 1)
}

/** 心形：(x²+y²-1)³ - x²y³ ≤ 0 */
function heartGrid(size: number): BeadGrid {
  const g = new BeadGrid(size, size)
  const pink = pick('#F3B6C2')
  const deep = pick('#D23C6E')
  const light = pick('#F7D6DC')

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2.5 - 1.25
      const ny = -(((y + 0.5) / size) * 2.5 - 1.25) - 0.12
      const f = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * ny * ny * ny
      if (f > 0) continue
      // 左上留一块高光，右下压一道深色，视觉上更立体
      const hl = (x - size * 0.34) ** 2 + (y - size * 0.32) ** 2 < (size * 0.16) ** 2
      const sh = (x - size * 0.6) ** 2 + (y - size * 0.72) ** 2 < (size * 0.2) ** 2
      g.set(x, y, hl ? light : sh ? deep : pink)
    }
  }
  g.version++
  return g
}

/** 五角星：内接多边形判定 */
function starGrid(size: number): BeadGrid {
  const g = new BeadGrid(size, size)
  const body = pick('#F5D547')
  const edge = pick('#F2B705')
  const cx = size / 2
  const cy = size / 2
  const R = size * 0.46
  const r = R * 0.46
  const pts: Array<[number, number]> = []
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 === 0 ? R : r
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad])
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5
      if (!pointInPolygon(px, py, pts)) continue
      const nearEdge = !pointInPolygonScale(px, py, pts, cx, cy, 0.86)
      g.set(x, y, nearEdge ? edge : body)
    }
  }
  g.version++
  return g
}

/** 五瓣花：极坐标花瓣 + 花心 */
function flowerGrid(size: number): BeadGrid {
  const g = new BeadGrid(size, size)
  const petal = pick('#F3B6C2')
  const petalDeep = pick('#E5B8B8')
  const core = pick('#F7E7B2')
  const cx = size / 2
  const cy = size / 2
  const R = size * 0.47

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - cx) / R
      const dy = (y + 0.5 - cy) / R
      const rr = Math.hypot(dx, dy)
      if (rr > 1) continue
      const ang = Math.atan2(dy, dx)
      const boundary = 0.52 + 0.44 * Math.pow(Math.abs(Math.cos(2.5 * ang)), 1.5)
      if (rr > boundary) continue
      if (rr < 0.2) {
        g.set(x, y, core)
      } else if (rr > boundary * 0.82) {
        g.set(x, y, petalDeep)
      } else {
        g.set(x, y, petal)
      }
    }
  }
  g.version++
  return g
}

/** 圆点方巾：留白边框 + 棋盘圆点，适合练手 */
function dotGrid(size: number): BeadGrid {
  const g = new BeadGrid(size, size)
  const dot = pick('#A6D9C4')
  const alt = pick('#F3B6C2')
  const step = Math.max(4, Math.round(size / 6))
  const rad = step * 0.3
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = ((x + 0.5) % step) - step / 2
      const gy = ((y + 0.5) % step) - step / 2
      if (Math.hypot(gx, gy) > rad) continue
      g.set(x, y, (Math.floor(x / step) + Math.floor(y / step)) % 2 === 0 ? dot : alt)
    }
  }
  g.version++
  return g
}

function pointInPolygon(px: number, py: number, poly: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** 以中心等比缩小后的多边形判定，用来找"边缘一圈" */
function pointInPolygonScale(
  px: number,
  py: number,
  poly: Array<[number, number]>,
  cx: number,
  cy: number,
  k: number
): boolean {
  const scaled = poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as [number, number])
  return pointInPolygon(px, py, scaled)
}

export const LIBRARY: LibraryPattern[] = [
  {
    id: 'heart-29',
    name: '小爱心',
    desc: '29×29，新手第一张，两三种粉色就够',
    size: 29,
    build: () => heartGrid(29)
  },
  {
    id: 'star-25',
    name: '奶油星星',
    desc: '25×25，边角料友好，可以做成挂件',
    size: 25,
    build: () => starGrid(25)
  },
  {
    id: 'flower-29',
    name: '五瓣小花',
    desc: '29×29，日系小物配色',
    size: 29,
    build: () => flowerGrid(29)
  },
  {
    id: 'dot-24',
    name: '波点方巾',
    desc: '24×24，格子感强，适合练习按色数豆',
    size: 24,
    build: () => dotGrid(24)
  }
]
