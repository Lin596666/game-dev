import { COLORS, deltaE, type BeadColor, type ColorSetId } from './colors'
import { EMPTY, type BeadGrid } from './grid'

export interface FitEntry {
  from: number
  to: number
  count: number
  /** 色差，越大说明替换得越勉强 */
  distance: number
}

export interface FitResult {
  /** 被替换掉的格子数 */
  changed: number
  /** 用到的颜色种类数（替换后） */
  colorsAfter: number
  entries: FitEntry[]
}

/** 某套色卡里的全部颜色 */
export function colorsOfSet(set: ColorSetId): BeadColor[] {
  return COLORS.filter((c) => c.set === set)
}

/**
 * 把图纸的配色整个吸附到一套色卡上。
 *
 * 用途：用户在基础色卡里画好了图，但她实际买的是莫兰迪色豆，
 * 一键换算成"用莫兰迪色卡实现"的样子，并告诉她哪几个色被换成了什么。
 *
 * 只做一次映射：同一个原色永远换成同一个目标色，
 * 不会出现“同一块颜色被拆成三种近似色”的脏结果。
 */
export function fitToColorSet(grid: BeadGrid, set: ColorSetId): FitResult {
  return fitToColors(grid, colorsOfSet(set))
}

export function fitToColors(grid: BeadGrid, allowed: BeadColor[]): FitResult {
  const targets = allowed.length > 0 ? allowed : COLORS
  const mapping = new Map<number, { to: number; distance: number }>()

  const resolve = (from: number): { to: number; distance: number } => {
    const hit = mapping.get(from)
    if (hit) return hit
    const src = COLORS.find((c) => c.id === from)
    let best = targets[0]!
    let bestD = Infinity
    if (src) {
      for (const t of targets) {
        if (t.id === from) {
          best = t
          bestD = 0
          break
        }
        const d = deltaE(src.lab, t.lab)
        if (d < bestD) {
          bestD = d
          best = t
        }
      }
    }
    const out = { to: best.id, distance: bestD === Infinity ? 0 : Math.round(bestD * 10) / 10 }
    mapping.set(from, out)
    return out
  }

  const counts = new Map<number, number>()
  let changed = 0
  for (let i = 0; i < grid.data.length; i++) {
    const v = grid.data[i]!
    if (v === EMPTY) continue
    const { to, distance } = resolve(v)
    if (to !== v) {
      grid.data[i] = to
      changed++
    }
    if (distance > 0) {
      const e = counts.get(v)
      counts.set(v, (e ?? 0) + 1)
    }
  }
  if (changed > 0) grid.version++

  const after = new Set<number>()
  for (let i = 0; i < grid.data.length; i++) {
    const v = grid.data[i]!
    if (v !== EMPTY) after.add(v)
  }

  const entries: FitEntry[] = []
  for (const [from, count] of counts) {
    const { to, distance } = resolve(from)
    if (to === from) continue
    entries.push({ from, to, count, distance })
  }
  entries.sort((a, b) => b.count - a.count)

  return { changed, colorsAfter: after.size, entries }
}
