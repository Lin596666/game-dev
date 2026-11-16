/**
 * 本地存储（IndexedDB，手写薄封装，不引第三方库）
 *
 * 只做三件事：保存工程、列出工程、删除工程。设计上刻意保持极简——
 * 数据是用户自己的，导入导出工程文件才是长期保障。
 */

export interface ProjectRecord {
  id: string
  name: string
  width: number
  height: number
  updatedAt: number
  createdAt: number
  /** 工程完整数据（ProjectFile 的 JSON 字符串，避免结构化克隆大数组） */
  payload: string
  /** 列表缩略图 dataURL（约 200px） */
  thumb?: string
  /** 用了多少颗豆子 */
  beads?: number
  /** 保存时选的烫法 id */
  finish?: string
}

export interface ProjectSummary {
  id: string
  name: string
  width: number
  height: number
  updatedAt: number
  createdAt: number
  thumb?: string
  beads?: number
  finish?: string
}

const DB_NAME = 'bead-atelier'
const DB_VERSION = 1
const STORE = 'projects'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('无法打开本地数据库'))
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('数据库操作失败'))
      })
  )
}

export async function saveProject(rec: ProjectRecord): Promise<void> {
  await tx('readwrite', (store) => store.put(rec))
}

export async function loadProject(id: string): Promise<ProjectRecord | undefined> {
  const rec = await tx<ProjectRecord | undefined>('readonly', (store) => store.get(id))
  return rec ?? undefined
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<ProjectRecord[]>('readonly', (store) => store.getAll())
  return all
    .map(({ id, name, width, height, updatedAt, createdAt, thumb, beads, finish }) => ({
      id,
      name,
      width,
      height,
      updatedAt,
      createdAt,
      thumb,
      beads,
      finish
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteProject(id: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(id))
}

/** iOS 上非安装态可能被回收存储，尽量申请持久化 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true
      return await navigator.storage.persist()
    }
  } catch {
    /* 忽略：拿不到就算了，导出工程文件才是兜底 */
  }
  return false
}
