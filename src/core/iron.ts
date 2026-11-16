/**
 * 烫法（成品效果）：同一张图纸，熨之前和熨之后完全是两种气质。
 * 这里只描述"看起来怎样"，具体画法由 2D 渲染器和 3D 舞台各自实现。
 */
export type IronFinishId =
  | 'raw'
  | 'cloth'
  | 'baking'
  | 'coarse'
  | 'fine'
  | 'rainbowCoarse'
  | 'rainbowFine'

export interface IronFinish {
  id: IronFinishId
  name: string
  desc: string
  /** true = 已熨烫（豆孔合上、形状变方） */
  ironed: boolean
  /** 闪粉覆盖率 0–1 */
  sparkle: number
  /** 闪粉是否带七彩反光 */
  rainbow: boolean
  /** 3D 里珠子被压扁的比例，1 = 未烫 */
  flatten: number
  /** 3D 材质粗糙度 */
  roughness: number
}

export const IRON_FINISHES: IronFinish[] = [
  {
    id: 'raw',
    name: '未烫成品',
    desc: '圆珠带孔，看得出每一颗豆子的样子',
    ironed: false,
    sparkle: 0,
    rainbow: false,
    flatten: 1,
    roughness: 0.42
  },
  {
    id: 'cloth',
    name: '布烫',
    desc: '隔着棉布轻压，表面哑光，豆孔变浅',
    ironed: true,
    sparkle: 0,
    rainbow: false,
    flatten: 0.72,
    roughness: 0.78
  },
  {
    id: 'baking',
    name: '烤纸烫',
    desc: '烘焙纸压得最平，豆孔几乎合上',
    ironed: true,
    sparkle: 0,
    rainbow: false,
    flatten: 0.55,
    roughness: 0.62
  },
  {
    id: 'coarse',
    name: '粗闪',
    desc: '大颗粒闪粉，灯下星星点点',
    ironed: true,
    sparkle: 0.08,
    rainbow: false,
    flatten: 0.62,
    roughness: 0.5
  },
  {
    id: 'fine',
    name: '细闪',
    desc: '细密闪粉，整体微微发亮',
    ironed: true,
    sparkle: 0.2,
    rainbow: false,
    flatten: 0.62,
    roughness: 0.45
  },
  {
    id: 'rainbowCoarse',
    name: '彩虹粗闪',
    desc: '闪粉带七彩反光，颗粒偏大',
    ironed: true,
    sparkle: 0.1,
    rainbow: true,
    flatten: 0.6,
    roughness: 0.42
  },
  {
    id: 'rainbowFine',
    name: '彩虹细闪',
    desc: '七彩细闪铺满，最亮的一种',
    ironed: true,
    sparkle: 0.24,
    rainbow: true,
    flatten: 0.6,
    roughness: 0.4
  }
]

export function finishById(id: IronFinishId): IronFinish {
  return IRON_FINISHES.find((f) => f.id === id) ?? IRON_FINISHES[0]!
}

/** 稳定的伪随机：同一个格子永远闪同一个位置，不会每帧乱跳 */
export function cellHash(x: number, y: number): number {
  let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x79b9, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2545f491)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

export interface Sparkle {
  on: boolean
  /** 在格子内的相对位置 0–1 */
  px: number
  py: number
  /** 0–1，决定大小与明暗 */
  size: number
  /** 0–5 的色相档位（rainbow 时用） */
  hue: number
}

/** 这个格子要不要闪、闪在哪 */
export function sparkleAt(x: number, y: number, finish: IronFinish): Sparkle {
  const none: Sparkle = { on: false, px: 0.5, py: 0.5, size: 0, hue: 0 }
  if (finish.sparkle <= 0) return none
  const h1 = cellHash(x, y)
  if (h1 >= finish.sparkle) return none
  const h2 = cellHash(y + 17, x + 31)
  const h3 = cellHash(x + 101, y + 7)
  return {
    on: true,
    px: 0.22 + h2 * 0.56,
    py: 0.22 + h3 * 0.56,
    size: 0.12 + cellHash(x + 5, y + 5) * 0.16,
    hue: Math.floor(cellHash(x + 3, y + 9) * 6)
  }
}

/** 彩虹闪粉的六档颜色 */
export const RAINBOW_COLORS = ['#FF8FA3', '#FFC978', '#FFF1A8', '#A8E0C0', '#A8C8F0', '#D0B3F0']
