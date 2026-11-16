/**
 * 分享码：把一张图纸压成一串字符，塞进 URL 或聊天框，对方粘回来就能打开。
 *
 * 不需要服务器——拼豆图纸绝大多数是"大片同色"，行程编码（RLE）能压得很狠，
 * 29×29 的小图一般只剩几百个字符。格式：
 *   b1.<w>.<h>.<base64url(varint 行程对)>
 * 行程对是 (连续几格, 颜色 id) 的变长整数，颜色 id 0 表示空格。
 */
const PREFIX = 'b1'

export interface SharePayload {
  name: string
  width: number
  height: number
  cells: Uint16Array
  done?: Uint8Array
}

function writeVarint(out: number[], value: number): void {
  let v = value
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80)
    v = Math.floor(v / 128)
  }
  out.push(v)
}

function readVarint(bytes: Uint8Array, pos: { i: number }): number {
  let result = 0
  let shift = 1
  while (pos.i < bytes.length) {
    const b = bytes[pos.i++]!
    result += (b & 0x7f) * shift
    if ((b & 0x80) === 0) return result
    shift *= 128
  }
  throw new Error('分享码不完整')
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const pad = text.length % 4 === 0 ? '' : '='.repeat(4 - (text.length % 4))
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** 把图纸编码成分享码（不含名称，名称另存，避免中文占位） */
export function encodeShare(payload: SharePayload): string {
  const { width, height, cells } = payload
  const out: number[] = []
  let run = 0
  let current = -1
  for (let i = 0; i < cells.length; i++) {
    const id = cells[i]!
    if (id === current) {
      run++
      continue
    }
    if (current >= 0) {
      writeVarint(out, run)
      writeVarint(out, current)
    }
    current = id
    run = 1
  }
  if (current >= 0) {
    writeVarint(out, run)
    writeVarint(out, current)
  }
  const body = toBase64Url(new Uint8Array(out))
  return `${PREFIX}.${width}.${height}.${body}`
}

/** 解码分享码；格式不对就抛错，调用方负责提示 */
export function decodeShare(code: string): SharePayload {
  const text = code.trim()
  const parts = text.split('.')
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('不是有效的分享码')
  }
  const width = Number(parts[1])
  const height = Number(parts[2])
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error('分享码尺寸不对')
  if (width <= 0 || height <= 0 || width > 600 || height > 600) {
    throw new Error('分享码尺寸超出范围')
  }
  const bytes = fromBase64Url(parts[3]!)
  const cells = new Uint16Array(width * height)
  const pos = { i: 0 }
  let filled = 0
  while (pos.i < bytes.length) {
    const run = readVarint(bytes, pos)
    const id = readVarint(bytes, pos)
    for (let k = 0; k < run && filled < cells.length; k++) cells[filled++] = id
  }
  if (filled !== cells.length) throw new Error('分享码格子数量对不上')
  return { name: '', width, height, cells }
}

/** 生成可粘贴的链接（只带 hash，不会被服务器记录） */
export function shareUrl(code: string, base?: string): string {
  const root = base ?? (typeof location === 'undefined' ? '' : `${location.origin}${location.pathname}`)
  return `${root}#p=${code}`
}

/** 从 URL hash 里取分享码（没有就返回空串） */
export function shareCodeFromUrl(hash: string): string {
  const m = /[#&]p=([^&]+)/.exec(hash)
  return m ? decodeURIComponent(m[1]!) : ''
}
