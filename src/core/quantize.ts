import { COLORS, deltaE, rgbToLab, type BeadColor, type ColorSetId } from './colors'
import { EMPTY } from './grid'

/**
 * 图片 → 拼豆网格
 *
 * 流程：区域平均采样 → 映射到色卡最近色（CIELAB）→ 可选限制色数 → 可选 Floyd–Steinberg 抖动
 */

export interface QuantizeOptions {
  targetWidth: number
  targetHeight: number
  /** 限定某个色卡分组；不传则用全部颜色 */
  set?: ColorSetId
  /** 0 或省略 = 不限色数 */
  maxColors?: number
  /** 是否开启误差扩散抖动（照片转图纸时更自然） */
  dither?: boolean
  /** 透明度阈值，低于此值视为空位 */
  alphaThreshold?: number
}

export interface QuantizeResult {
  data: Uint16Array
  /** 实际用到的色号，按使用量降序 */
  used: Array<{ id: number; count: number }>
}

interface Sampled {
  width: number
  height: number
  r: Float32Array
  g: Float32Array
  b: Float32Array
  a: Float32Array
}

/** 把源图按目标尺寸做区域平均采样（缩小取均值，放大取最近点） */
export function sampleImage(
  source: { data: Uint8ClampedArray; width: number; height: number },
  tw: number,
  th: number
): Sampled {
  const r = new Float32Array(tw * th)
  const g = new Float32Array(tw * th)
  const b = new Float32Array(tw * th)
  const a = new Float32Array(tw * th)
  const sx = source.width / tw
  const sy = source.height / th

  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy))
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx))
      let sr = 0
      let sg = 0
      let sb = 0
      let sa = 0
      let n = 0
      for (let yy = y0; yy < y1 && yy < source.height; yy++) {
        for (let xx = x0; xx < x1 && xx < source.width; xx++) {
          const i = (yy * source.width + xx) * 4
          const alpha = source.data[i + 3]! / 255
          sr += source.data[i]! * alpha
          sg += source.data[i + 1]! * alpha
          sb += source.data[i + 2]! * alpha
          sa += alpha
          n++
        }
      }
      const idx = y * tw + x
      if (n === 0 || sa === 0) {
        a[idx] = 0
        continue
      }
      r[idx] = sr / n
      g[idx] = sg / n
      b[idx] = sb / n
      a[idx] = sa / n
    }
  }

  return { width: tw, height: th, r, g, b, a }
}

function candidatesFor(set?: ColorSetId): BeadColor[] {
  return set ? COLORS.filter((c) => c.set === set) : COLORS
}

function nearest(r: number, g: number, b: number, pool: BeadColor[]): BeadColor {
  const lab = rgbToLab(r, g, b)
  let best = pool[0]!
  let bestD = Number.POSITIVE_INFINITY
  for (const c of pool) {
    const d = deltaE(lab, c.lab)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

export function quantizeImage(
  source: { data: Uint8ClampedArray; width: number; height: number },
  options: QuantizeOptions
): QuantizeResult {
  const tw = Math.max(1, Math.floor(options.targetWidth))
  const th = Math.max(1, Math.floor(options.targetHeight))
  const alphaThreshold = options.alphaThreshold ?? 0.35
  const s = sampleImage(source, tw, th)

  let pool = candidatesFor(options.set)

  // 第一遍：统计每个色号被匹配的次数，用于「限制色数」
  const usage = new Map<number, number>()
  const firstPass = new Uint16Array(tw * th)
  for (let i = 0; i < tw * th; i++) {
    if (s.a[i]! < alphaThreshold) continue
    const c = nearest(s.r[i]!, s.g[i]!, s.b[i]!, pool)
    firstPass[i] = c.id
    usage.set(c.id, (usage.get(c.id) ?? 0) + 1)
  }

  const maxColors = options.maxColors ?? 0
  if (maxColors > 0 && usage.size > maxColors) {
    const keep = [...usage.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxColors)
      .map(([id]) => id)
    const keepSet = new Set(keep)
    pool = pool.filter((c) => keepSet.has(c.id))
  }

  const out = new Uint16Array(tw * th)
  const counts = new Map<number, number>()

  if (!options.dither) {
    for (let i = 0; i < tw * th; i++) {
      if (s.a[i]! < alphaThreshold) {
        out[i] = EMPTY
        continue
      }
      const c = nearest(s.r[i]!, s.g[i]!, s.b[i]!, pool)
      out[i] = c.id
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1)
    }
  } else {
    // 误差扩散：按行扫描，把量化误差按 7/16、3/16、5/16、1/16 分给邻格
    const errR = new Float32Array(tw * th)
    const errG = new Float32Array(tw * th)
    const errB = new Float32Array(tw * th)

    const distribute = (x: number, y: number, er: number, eg: number, eb: number) => {
      if (x < 0 || x >= tw || y < 0 || y >= th) return
      const i = y * tw + x
      if (s.a[i]! < alphaThreshold) return
      errR[i] += er
      errG[i] += eg
      errB[i] += eb
    }

    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const i = y * tw + x
        if (s.a[i]! < alphaThreshold) {
          out[i] = EMPTY
          continue
        }
        const r = Math.max(0, Math.min(255, s.r[i]! + errR[i]!))
        const g = Math.max(0, Math.min(255, s.g[i]! + errG[i]!))
        const b = Math.max(0, Math.min(255, s.b[i]! + errB[i]!))
        const c = nearest(r, g, b, pool)
        out[i] = c.id
        counts.set(c.id, (counts.get(c.id) ?? 0) + 1)

        const dr = r - c.rgb[0]
        const dg = g - c.rgb[1]
        const db = b - c.rgb[2]
        distribute(x + 1, y, (dr * 7) / 16, (dg * 7) / 16, (db * 7) / 16)
        distribute(x - 1, y + 1, (dr * 3) / 16, (dg * 3) / 16, (db * 3) / 16)
        distribute(x, y + 1, (dr * 5) / 16, (dg * 5) / 16, (db * 5) / 16)
        distribute(x + 1, y + 1, (dr * 1) / 16, (dg * 1) / 16, (db * 1) / 16)
      }
    }
  }

  const used = [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)

  return { data: out, used }
}
