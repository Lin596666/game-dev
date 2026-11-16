/**
 * 作品存储：直接用小程序的本地缓存。
 *
 * 为什么不用 IndexedDB：小程序没有。wx 的 storage 单 key 上限 1MB、
 * 总量 10MB，一张 96×96 的图纸 base64 后约 36KB，够存两百多张。
 * 真要存更多，可以换成文件系统（wx.getFileSystemManager），这里先不做。
 */
const KEY = 'bead:projects'

function list() {
  try {
    const raw = wx.getStorageSync(KEY)
    return Array.isArray(raw) ? raw : []
  } catch (e) {
    return []
  }
}

function find(id) {
  return list().find((p) => p.id === id) || null
}

/** 存一张作品（有同 id 就覆盖），返回最新的列表 */
function save(record) {
  const all = list()
  const i = all.findIndex((p) => p.id === record.id)
  if (i >= 0) all[i] = record
  else all.unshift(record)
  all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  try {
    wx.setStorageSync(KEY, all)
  } catch (e) {
    wx.showToast({ title: '本地空间不足，先删几个旧作品', icon: 'none' })
  }
  return all
}

function remove(id) {
  const all = list().filter((p) => p.id !== id)
  try {
    wx.setStorageSync(KEY, all)
  } catch (e) {
    /* 删东西不会失败，忽略 */
  }
  return all
}

function clear() {
  wx.removeStorageSync(KEY)
}

function toggleStar(id) {
  const rec = find(id)
  if (!rec) return false
  rec.starred = !rec.starred
  save(rec)
  return rec.starred
}

module.exports = { list, find, save, remove, clear }
