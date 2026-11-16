const core = require('../../core/index.js')
const db = require('../../utils/db.js')

function timeText(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

Page({
  data: {
    works: [],
    library: core.LIBRARY.map((p) => ({ id: p.id, name: p.name, desc: p.desc, size: `${p.size}×${p.size}` })),
    sizes: [29, 48, 58, 72, 96]
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const works = db.list().map((p) => ({
      id: p.id,
      name: p.name || '未命名',
      size: `${p.width}×${p.height}`,
      time: timeText(p.updatedAt)
    }))
    this.setData({ works })
  },

  openWork(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/editor/editor?id=${id}` })
  },

  openLib(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/editor/editor?lib=${id}` })
  },

  newBlank(e) {
    const size = Number(e.currentTarget.dataset.size)
    wx.navigateTo({ url: `/pages/editor/editor?w=${size}&h=${size}` })
  },

  deleteWork(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删掉这张作品？',
      content: '删了就找不回来了，建议先在小程序里截个图',
      confirmText: '删除',
      confirmColor: '#C97B5A',
      success: (res) => {
        if (!res.confirm) return
        db.remove(id)
        this.refresh()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  // 相册里的照片 → 拼豆图纸：选完图再挑尺寸，进编辑器后由离屏画布逐像素采样
  onImportTap() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        const sizes = [29, 48, 58, 72, 96]
        wx.showActionSheet({
          itemList: ['29×29 小挂件', '48×48 常用', '58×58 标准板', '72×72 大一点', '96×96 大幅'],
          success: (r) => {
            const size = sizes[r.tapIndex]
            const url =
              `/pages/editor/editor?img=${encodeURIComponent(file.tempFilePath)}` +
              `&w=${size}&h=${size}&name=${encodeURIComponent('图片图纸')}`
            wx.navigateTo({ url })
          }
        })
      },
      fail: () => {
        /* 用户取消选图，什么都不用做 */
      }
    })
  }
})
