/**
 * 拼豆色卡
 *
 * 说明：这里的色值为「屏幕近似值」，用于取色与视觉匹配，不代表任何品牌的官方色号。
 * 序号（id）就是网格数据里存的值：0 表示空位，其余为 COLORS[id-1]。
 */

export type ColorSetId = 'basic' | 'candy' | 'morandi' | 'nature'

export interface ColorSetMeta {
  id: ColorSetId
  label: string
  desc: string
}

export const COLOR_SETS: ColorSetMeta[] = [
  { id: 'basic', label: '基础色', desc: '通用拼豆配色，覆盖度高' },
  { id: 'candy', label: '日系糖果', desc: '柔和粉彩，适合小物与角色' },
  { id: 'morandi', label: '莫兰迪', desc: '低饱和灰调，适合风景与静物' },
  { id: 'nature', label: '自然色', desc: '植物、动物与写实题材' }
]

export interface BeadColor {
  id: number
  code: string
  name: string
  hex: string
  rgb: [number, number, number]
  lab: [number, number, number]
  set: ColorSetId
}

interface RawColor {
  name: string
  hex: string
}

const BASIC: RawColor[] = [
  { name: '白', hex: '#F7F5F2' },
  { name: '米白', hex: '#F0E7D8' },
  { name: '浅灰', hex: '#D8D4CE' },
  { name: '灰', hex: '#A9A4A0' },
  { name: '深灰', hex: '#6B6763' },
  { name: '黑', hex: '#2E2C2A' },
  { name: '奶油黄', hex: '#F7E7B2' },
  { name: '柠檬黄', hex: '#F5D547' },
  { name: '向日葵', hex: '#F2B705' },
  { name: '橘黄', hex: '#F59A23' },
  { name: '橘红', hex: '#ED6A33' },
  { name: '朱红', hex: '#D93A2B' },
  { name: '正红', hex: '#C0182B' },
  { name: '玫红', hex: '#D23C6E' },
  { name: '樱粉', hex: '#F3B6C2' },
  { name: '淡粉', hex: '#F7D6DC' },
  { name: '藕粉', hex: '#E5B8B8' },
  { name: '紫红', hex: '#A63B6B' },
  { name: '葡萄紫', hex: '#6E4A8E' },
  { name: '薰衣草', hex: '#B7A6D6' },
  { name: '雪青', hex: '#8E7FC0' },
  { name: '深蓝', hex: '#22406E' },
  { name: '宝蓝', hex: '#2A5DB0' },
  { name: '天蓝', hex: '#6BB8E0' },
  { name: '水蓝', hex: '#A8D8E8' },
  { name: '薄荷绿', hex: '#A6D9C4' },
  { name: '草绿', hex: '#5FA860' },
  { name: '森林绿', hex: '#2E6B47' },
  { name: '橄榄绿', hex: '#7A8B3F' },
  { name: '黄绿', hex: '#B8CC4A' },
  { name: '卡其', hex: '#C9B38A' },
  { name: '浅棕', hex: '#B98A5E' },
  { name: '棕', hex: '#8A5A34' },
  { name: '深棕', hex: '#5C3B22' },
  { name: '巧克力', hex: '#3E2A1C' },
  { name: '肤色', hex: '#F2CDB2' },
  { name: '浅肤', hex: '#F8E0CD' },
  { name: '驼色', hex: '#D2B48C' },
  { name: '砖红', hex: '#A65A3E' },
  { name: '陶土', hex: '#C97B5A' },
  { name: '雾霾蓝', hex: '#7E93A8' },
  { name: '灰蓝', hex: '#5E7182' },
  { name: '藏青', hex: '#33415C' },
  { name: '苔藓', hex: '#6B7A5A' },
  { name: '藕荷', hex: '#C7A9B8' },
  { name: '奶茶', hex: '#D8C3AE' },
  { name: '麦色', hex: '#E3CFA8' },
  { name: '珊瑚', hex: '#F08A7A' }
]

const CANDY: RawColor[] = [
  { name: '棉花糖', hex: '#FDE8EF' },
  { name: '草莓奶', hex: '#F9C6D4' },
  { name: '蜜桃', hex: '#F5A3B7' },
  { name: '玫瑰糖', hex: '#EF7D9E' },
  { name: '树莓', hex: '#E85D86' },
  { name: '杏子', hex: '#FFD9C0' },
  { name: '蜜柑', hex: '#FFC49B' },
  { name: '焦糖橙', hex: '#F7A96A' },
  { name: '奶油黄', hex: '#FFE9A8' },
  { name: '布丁', hex: '#FBE38E' },
  { name: '青苹果', hex: '#E9EFA6' },
  { name: '抹茶奶', hex: '#C6E6A0' },
  { name: '薄荷', hex: '#A8DCA0' },
  { name: '苏打绿', hex: '#8FD3C0' },
  { name: '汽水蓝', hex: '#A9DCE9' },
  { name: '天空', hex: '#BBD7F0' },
  { name: '矢车菊', hex: '#A9C0E8' },
  { name: '薰衣草奶', hex: '#C3B8E8' },
  { name: '紫罗兰糖', hex: '#D6C2E8' },
  { name: '紫阳花', hex: '#E2C6DC' },
  { name: '樱花', hex: '#F0C6C6' },
  { name: '白桃', hex: '#EFD5C4' },
  { name: '米色奶', hex: '#E8E0D4' },
  { name: '雾灰', hex: '#D9D9E0' }
]

const MORANDI: RawColor[] = [
  { name: '灰绿', hex: '#C9CFC9' },
  { name: '橄榄灰', hex: '#AEBBAE' },
  { name: '松绿', hex: '#93A39B' },
  { name: '墨绿灰', hex: '#7C8C88' },
  { name: '米灰', hex: '#B8B2A7' },
  { name: '岩石', hex: '#A79E92' },
  { name: '咖啡灰', hex: '#8E8577' },
  { name: '深灰褐', hex: '#6E675E' },
  { name: '驼灰', hex: '#C7B8AE' },
  { name: '豆沙', hex: '#B99F94' },
  { name: '灰砖', hex: '#A8847C' },
  { name: '赤陶灰', hex: '#8C6760' },
  { name: '藕灰', hex: '#C4A8A3' },
  { name: '灰粉', hex: '#B79AA2' },
  { name: '灰紫', hex: '#9E8A93' },
  { name: '紫灰', hex: '#8A7C8C' },
  { name: '蓝紫灰', hex: '#A8A3B5' },
  { name: '蓝灰', hex: '#8B91A3' },
  { name: '石板蓝', hex: '#74809A' },
  { name: '藏蓝灰', hex: '#5F6B82' },
  { name: '雾蓝', hex: '#9FB0BC' },
  { name: '浅灰蓝', hex: '#B9C6CE' },
  { name: '亚麻', hex: '#D5C9B8' },
  { name: '米白', hex: '#E2D8C8' }
]

const NATURE: RawColor[] = [
  { name: '雪白', hex: '#FFFFFF' },
  { name: '银', hex: '#EDEDED' },
  { name: '铅灰', hex: '#BFBFBF' },
  { name: '中灰', hex: '#8C8C8C' },
  { name: '炭', hex: '#4D4D4D' },
  { name: '墨黑', hex: '#000000' },
  { name: '咖啡', hex: '#7B4B2A' },
  { name: '陶', hex: '#A9745B' },
  { name: '沙', hex: '#D9B08C' },
  { name: '浅肤', hex: '#F0D2B4' },
  { name: '蜜肤', hex: '#F7E0C9' },
  { name: '嫩芽', hex: '#DEEBC8' },
  { name: '竹青', hex: '#B5D99C' },
  { name: '苔绿', hex: '#8CC084' },
  { name: '翡翠', hex: '#4F9E6A' },
  { name: '松针', hex: '#2F7D5B' },
  { name: '浅水色', hex: '#A7D8DE' },
  { name: '湖蓝', hex: '#6FC3D1' },
  { name: '孔雀', hex: '#3E9DB8' },
  { name: '深海', hex: '#2B6E8F' },
  { name: '麦穗', hex: '#F2E2A0' },
  { name: '金', hex: '#E8C766' },
  { name: '铜', hex: '#C98F3C' },
  { name: '褐金', hex: '#8C6B2F' }
]

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ]
}

function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r)
  const G = srgbToLinear(g)
  const B = srgbToLinear(b)

  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** CIE76 色差，够用且极快 */
export function deltaE(a: [number, number, number], b: [number, number, number]): number {
  const dl = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dl * dl + da * da + db * db)
}

function buildColors(): BeadColor[] {
  const groups: Array<[ColorSetId, string, RawColor[]]> = [
    ['basic', 'B', BASIC],
    ['candy', 'C', CANDY],
    ['morandi', 'M', MORANDI],
    ['nature', 'N', NATURE]
  ]

  const seen = new Map<string, number>()
  const out: BeadColor[] = []

  for (const [set, prefix, list] of groups) {
    let n = 0
    for (const raw of list) {
      const key = raw.hex.toUpperCase()
      const existing = seen.get(key)
      if (existing !== undefined) {
        // 同色不重复入表，避免网格中出现两个等价色号
        continue
      }
      n += 1
      const rgb = hexToRgb(raw.hex)
      const id = out.length + 1
      seen.set(key, id)
      out.push({
        id,
        code: `${prefix}${String(n).padStart(2, '0')}`,
        name: raw.name,
        hex: key,
        rgb,
        lab: rgbToLab(rgb[0], rgb[1], rgb[2]),
        set
      })
    }
  }

  return out
}

export const COLORS: BeadColor[] = buildColors()
export const COLOR_COUNT = COLORS.length

const byHex = new Map<string, BeadColor>(COLORS.map((c) => [c.hex.toUpperCase(), c]))

/** 网格里存的 0 表示空位，所以颜色 id 从 1 开始，COLORS[i-1] 对应 id=i */
export function colorById(id: number): BeadColor | null {
  if (id <= 0 || id > COLORS.length) return null
  return COLORS[id - 1]!
}

export function colorByHex(hex: string): BeadColor | null {
  return byHex.get(hex.toUpperCase()) ?? null
}

/** 找到最接近的已有色（导入工程文件时用于把外部颜色吸附进色卡） */
export function nearestColorToRgb(r: number, g: number, b: number, set?: ColorSetId): BeadColor {
  const lab = rgbToLab(r, g, b)
  let best = COLORS[0]!
  let bestD = Number.POSITIVE_INFINITY
  for (const c of COLORS) {
    if (set && c.set !== set) continue
    const d = deltaE(lab, c.lab)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

export interface SwatchGroup {
  set: ColorSetMeta
  colors: BeadColor[]
}

export function groupedColors(): SwatchGroup[] {
  return COLOR_SETS.map((set) => ({
    set,
    colors: COLORS.filter((c) => c.set === set.id)
  }))
}

/** #RRGGBB → {r,g,b}，供渲染器做明暗微调 */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const mix = (c: number) =>
    Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))))
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** 在珠子上写编号时用，浅色珠用深字、深色珠用浅字 */
export function inkOn(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? '#3A342E' : '#FFFFFF'
}
