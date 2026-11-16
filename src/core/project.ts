import { BeadGrid } from './grid'

/** 工程文件格式（.bead.json）。纯逻辑，无 DOM 依赖，方便单测 */

export const PROJECT_VERSION = 1

export interface ProjectFile {
  v: number
  id: string
  name: string
  width: number
  height: number
  /** 网格数据，Uint16 小端字节的 base64 */
  cells: string
  /** 跟拼进度（0/1 每格一字节），可选 */
  done?: string
  pricePerBead?: number
  createdAt: number
  updatedAt: number
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function cellsToBase64(data: Uint16Array): string {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return bytesToBase64(bytes)
}

export function base64ToCells(b64: string, expectedLength: number): Uint16Array {
  const bytes = base64ToBytes(b64)
  const out = new Uint16Array(expectedLength)
  const view = new Uint16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
  out.set(view.subarray(0, Math.min(view.length, expectedLength)))
  return out
}

export function doneToBase64(done: Uint8Array): string {
  return bytesToBase64(done)
}

export function base64ToDone(b64: string | undefined, length: number): Uint8Array {
  const out = new Uint8Array(length)
  if (!b64) return out
  const bytes = base64ToBytes(b64)
  out.set(bytes.subarray(0, Math.min(bytes.length, length)))
  return out
}

export function createProjectFile(
  grid: BeadGrid,
  meta: { id: string; name: string; pricePerBead?: number; done?: Uint8Array; createdAt?: number }
): ProjectFile {
  const now = Date.now()
  return {
    v: PROJECT_VERSION,
    id: meta.id,
    name: meta.name,
    width: grid.width,
    height: grid.height,
    cells: cellsToBase64(grid.data),
    done: meta.done ? doneToBase64(meta.done) : undefined,
    pricePerBead: meta.pricePerBead,
    createdAt: meta.createdAt ?? now,
    updatedAt: now
  }
}

export interface ParsedProject {
  grid: BeadGrid
  done: Uint8Array
  name: string
  id: string
  pricePerBead: number
  createdAt: number
  updatedAt: number
}

export function parseProjectFile(raw: unknown): ParsedProject {
  if (typeof raw !== 'object' || raw === null) throw new Error('工程文件格式不正确')
  const doc = raw as Partial<ProjectFile>
  if (doc.v !== PROJECT_VERSION) throw new Error(`不支持的工程版本：${String(doc.v)}`)
  if (!doc.width || !doc.height || !doc.cells) throw new Error('工程文件缺少必要字段')

  const width = Math.floor(doc.width)
  const height = Math.floor(doc.height)
  if (width < 1 || height < 1 || width > 600 || height > 600) throw new Error('网格尺寸超出范围')

  const cells = base64ToCells(doc.cells, width * height)
  const grid = new BeadGrid(width, height, cells)

  return {
    grid,
    done: base64ToDone(doc.done, width * height),
    name: doc.name || '未命名图纸',
    id: doc.id || crypto.randomUUID(),
    pricePerBead: doc.pricePerBead ?? 0.03,
    createdAt: doc.createdAt ?? Date.now(),
    updatedAt: doc.updatedAt ?? Date.now()
  }
}

export function parseProjectText(text: string): ParsedProject {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('无法解析工程文件（不是有效的 JSON）')
  }
  return parseProjectFile(json)
}
