const core = require('../../core/index.js')
const db = require('../../utils/db.js')
const { Renderer } = require('../../utils/render.js')

const EMPTY = 0

Page({
  data: {
    name: '未命名',
    tool: 'pen',
    tools: [
      { id: 'pen', label: '画笔' },
      { id: 'eraser', label: '橡皮' },
      { id: 'bucket', label: '油漆桶' },
      { id: 'picker', label: '吸管' }
    ],
    sets: core.COLOR_SETS,
    setIndex: 0,
    swatches: [],
    colorId: 0,
    showNumbers: false,
    finishId: 'raw',
    finishName: '未烫成品',
    guideMode: false,
    guideColorId: 0,
    guideLabel: '全部未完成',
    guideOptions: [{ value: 0, label: '全部未完成' }],
    total: 0,
    progress: 0,
    sizeText: '',
    zoomText: '—',
    canUndo: false,
    canRedo: false
  },

  // ---------- 生命周期 ----------

  onLoad(query) {
    this.groups = core.groupedColors()
    this.grid = null
    this.done = null
    this.undo = new core.UndoStack(60)
    this.docId = ''
    this.createdAt = Date.now()
    this.touchMode = ''
    this.lastCell = null

    if (query.id) {
      const rec = db.find(query.id)
      if (rec) {
        try {
          const parsed = core.parseProjectFile(rec)
          this.grid = parsed.grid
          this.docId = parsed.id
          this.createdAt = parsed.createdAt || Date.now()
          this.done = parsed.done || new Uint8Array(parsed.grid.width * parsed.grid.height)
          const f = parsed.finish ? core.finishById(parsed.finish) : null
          this.setData({
            name: parsed.name || '未命名',
            finishId: f ? f.id : 'raw',
            finishName: f ? f.name : '未烫成品'
          })
        } catch (e) {
          wx.showToast({ title: '这个作品读不出来', icon: 'none' })
        }
      }
    }

    if (!this.grid && query.lib) {
      const pat = core.LIBRARY.find((p) => p.id === query.lib)
      if (pat) {
        this.grid = pat.build()
        this.docId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
        this.setData({ name: pat.name })
      }
    }

    if (!this.grid) {
      const w = Math.max(8, Math.min(120, Number(query.w) || 29))
      const h = Math.max(8, Math.min(120, Number(query.h) || w))
      this.grid = new core.BeadGrid(w, h)
      this.docId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
      if (query.name) this.setData({ name: decodeURIComponent(query.name) })
      // 图片转图纸：图片先记下来，等 canvas 就绪后再真正采样
      if (query.img) this.pendingImagePath = decodeURIComponent(query.img)
    }

    if (!this.done) this.done = new Uint8Array(this.grid.width * this.grid.height)

    const setIndex = 0
    this.setData({
      setIndex,
      swatches: this.groups[setIndex].colors.map((c) => ({ id: c.id, hex: c.hex })),
      colorId: this.groups[setIndex].colors[0].id,
      sizeText: `${this.grid.width}×${this.grid.height}`
    })
  },

  onReady() {
    this.initCanvas()
  },

  onHide() {
    this.persist()
  },

  onUnload() {
    this.persist()
  },

  initCanvas() {
    wx.createSelectorQuery()
      .select('#cv')
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res && res[0]
        if (!info || !info.node) {
          wx.showToast({ title: '画布初始化失败', icon: 'none' })
          return
        }
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 1
        const ctx = info.node.getContext('2d')
        this.canvasNode = info.node
        this.renderer = new Renderer(info.node, ctx, info.width, info.height, dpr)
        this.renderer.setGrid(this.grid)
        this.renderer.setOptions({ finish: core.finishById(this.data.finishId), sparkleAt: core.sparkleAt })
        this.fitZoom = this.renderer.zoom
        this.renderer.setGuide(this.guideState())
        this.renderer.render()
        this.setData({ zoomText: '100%' })
        this.updateStats()

        // 触摸事件用的是页面坐标，画布在页面里的偏移要单独量
        wx.createSelectorQuery()
          .select('#cv')
          .boundingClientRect((rect) => {
            if (rect) this.canvasRect = rect
          })
          .exec()

        if (this.pendingImagePath) this.importImage()
      })
  },

  // ---------- 图片转图纸 ----------

  importImage() {
    const path = this.pendingImagePath
    this.pendingImagePath = null
    if (!path || !this.renderer) return

    const W = this.grid.width
    const H = this.grid.height
    wx.showLoading({ title: '算颜色中…', mask: true })

    const finish = (pixels) => {
      try {
        const out = core.quantizeImage(pixels, {
          targetWidth: W,
          targetHeight: H,
          maxColors: 14,
          dither: false,
          alphaThreshold: 100
        })
        this.grid.data.set(out.data)
        this.grid.version++
        this.renderer.setGrid(this.grid)
        this.fitZoom = this.renderer.zoom
        this.redraw()
        this.updateStats()
        this.persist()
        wx.hideLoading()
        wx.showToast({ title: `用了 ${out.used.length} 种颜色`, icon: 'none' })
      } catch (e) {
        wx.hideLoading()
        wx.showToast({ title: '这张图不好处理，换张试试', icon: 'none' })
      }
    }

    const fail = () => {
      wx.hideLoading()
      wx.showToast({ title: '读不到这张图', icon: 'none' })
    }

    // 优先用离屏画布按网格分辨率画，像素最干净
    let off = null
    try {
      off = wx.createOffscreenCanvas({ type: '2d', width: W, height: H })
    } catch (e) {
      off = null
    }

    if (off) {
      const ctx = off.getContext('2d')
      const img = off.createImage()
      img.onload = () => {
        // cover：等比铺满再居中裁掉多余部分，图片不会被拉扁
        const s = Math.max(W / img.width, H / img.height)
        const dw = img.width * s
        const dh = img.height * s
        ctx.clearRect(0, 0, W, H)
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
        const px = ctx.getImageData(0, 0, W, H)
        finish({ data: px.data, width: W, height: H })
      }
      img.onerror = fail
      img.src = path
      return
    }

    // 老基础库没有离屏画布：借主画布采一次，采完立刻重绘回去
    const node = this.canvasNode
    const ctx = node.getContext('2d')
    const img = node.createImage()
    img.onload = () => {
      const cw = node.width
      const ch = node.height
      const s = Math.max(cw / img.width, ch / img.height)
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cw, ch)
      ctx.drawImage(img, (cw - img.width * s) / 2, (ch - img.height * s) / 2, img.width * s, img.height * s)
      ctx.restore()
      const px = ctx.getImageData(0, 0, cw, ch)
      finish({ data: px.data, width: cw, height: ch })
    }
    img.onerror = fail
    img.src = path
  },

  // ---------- 渲染同步 ----------

  guideState() {
    return {
      mode: this.data.guideMode,
      done: this.data.guideMode ? this.done : null,
      colorId: this.data.guideMode ? this.data.guideColorId : 0,
      focus: null
    }
  },

  redraw() {
    if (!this.renderer) return
    this.renderer.setGuide(this.guideState())
    this.renderer.render()
    this.setData({ zoomText: `${Math.round((this.renderer.zoom / 12) * 100)}%` })
  },

  updateStats() {
    const usage = core.colorUsage(this.grid)
    const total = this.grid.usedCount()
    let doneCount = 0
    for (let i = 0; i < this.grid.data.length; i++) {
      if (this.grid.data[i] !== EMPTY && this.done[i]) doneCount++
    }
    const guideOptions = [
      { value: 0, label: '全部未完成' },
      ...usage.map((u) => ({ value: u.id, label: `${u.color.code} ${u.color.name}（${u.count}）` }))
    ]

    // 某个颜色拼完了、或者被橡皮擦掉了，高亮选择要退回「全部」
    let guideColorId = this.data.guideColorId
    let guideLabel = this.data.guideLabel
    if (guideColorId && !usage.some((u) => u.id === guideColorId)) {
      guideColorId = 0
      guideLabel = '全部未完成'
    }

    this.setData({
      total,
      progress: total === 0 ? 0 : Math.round((doneCount / total) * 100),
      canUndo: this.undo.canUndo,
      canRedo: this.undo.canRedo,
      guideOptions,
      guideColorId,
      guideLabel
    })
  },

  // ---------- 工具 ----------

  onTool(e) {
    this.setData({ tool: e.currentTarget.dataset.id })
  },

  onPickColor(e) {
    this.setData({ colorId: Number(e.currentTarget.dataset.id) })
  },

  onSetIndex(e) {
    const setIndex = Number(e.currentTarget.dataset.index)
    const group = this.groups[setIndex]
    this.setData({
      setIndex,
      swatches: group.colors.map((c) => ({ id: c.id, hex: c.hex })),
      colorId: group.colors[0].id
    })
    wx.setStorageSync('bead:lastSet', group.set.id)
  },

  chooseFinish() {
    const list = core.IRON_FINISHES
    wx.showActionSheet({
      itemList: list.map((f) => f.name),
      success: (res) => {
        const f = list[res.tapIndex]
        if (!f) return
        this.setData({ finishId: f.id, finishName: f.name })
        if (this.renderer) {
          this.renderer.setOptions({ finish: f, sparkleAt: core.sparkleAt })
        }
        this.persist()
      }
    })
  },

  toggleNumbers() {
    this.setData({ showNumbers: !this.data.showNumbers })
    if (this.renderer) this.renderer.setOptions({ showNumbers: this.data.showNumbers })
    this.redraw()
  },

  toggleGuide() {
    this.setData({ guideMode: !this.data.guideMode })
    this.redraw()
  },

  onGuideColorPick(e) {
    const idx = Number(e.detail.value) || 0
    const opt = this.data.guideOptions[idx] || { value: 0, label: '全部未完成' }
    this.setData({ guideColorId: opt.value, guideLabel: opt.label })
    this.redraw()
  },

  fitView() {
    if (!this.renderer) return
    this.renderer.fit()
    this.redraw()
  },

  zoomIn() {
    if (!this.renderer) return
    this.renderer.zoomAt(1.25, this.renderer.cssW / 2, this.renderer.cssH / 2)
    this.redraw()
  },

  zoomOut() {
    if (!this.renderer) return
    this.renderer.zoomAt(0.8, this.renderer.cssW / 2, this.renderer.cssH / 2)
    this.redraw()
  },

  // ---------- 触摸绘制 ----------

  relPoint(touch) {
    // 触摸事件给的是页面坐标，画布在页面里的位置要从 boundingClientRect 里减掉
    const r = this.canvasRect || { left: 0, top: 0 }
    return { x: touch.clientX - r.left, y: touch.clientY - r.top }
  },

  onTouchStart(e) {
    if (!this.renderer) return
    const touches = e.touches
    if (touches.length >= 2) {
      this.touchMode = 'pinch'
      this.pinch = {
        dist: this.dist(touches),
        zoom: this.renderer.zoom
      }
      return
    }
    this.touchMode = 'draw'
    this.strokeSnapshot = this.grid.snapshot()
    const p = this.relPoint(touches[0])
    this.lastCell = null
    this.applyAt(p.x, p.y, true)
  },

  onTouchMove(e) {
    if (!this.renderer) return
    const touches = e.touches
    if (this.touchMode === 'pinch' && touches.length >= 2) {
      const factor = this.dist(touches) / (this.pinch.dist || 1)
      const target = this.pinch.zoom * factor
      this.renderer.zoomAt(target / this.renderer.zoom, this.renderer.cssW / 2, this.renderer.cssH / 2)
      this.redraw()
      return
    }
    if (this.touchMode !== 'draw') return
    const p = this.relPoint(touches[0])
    this.applyAt(p.x, p.y, false)
  },

  onTouchEnd() {
    if (this.touchMode === 'draw') {
      this.commitStroke()
    }
    this.touchMode = ''
    this.lastCell = null
  },

  dist(touches) {
    const a = touches[0]
    const b = touches[1]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  },

  applyAt(px, py, isStart) {
    const cell = this.renderer.screenToCell(px, py)
    if (!cell) return

    if (this.data.guideMode) {
      if (!isStart) return
      const i = cell.y * this.grid.width + cell.x
      if (this.grid.data[i] === EMPTY) return
      this.done[i] = this.done[i] ? 0 : 1
      this.redraw()
      this.updateStats()
      return
    }

    const tool = this.data.tool
    const color = this.data.colorId

    if (tool === 'picker') {
      const v = this.grid.data[cell.y * this.grid.width + cell.x]
      if (v) this.setData({ colorId: v })
      return
    }

    if (tool === 'bucket') {
      if (isStart) {
        this.grid.floodFill(cell.x, cell.y, color)
        this.redraw()
      }
      return
    }

    const paint = tool === 'eraser' ? EMPTY : color
    if (this.lastCell && (this.lastCell.x !== cell.x || this.lastCell.y !== cell.y)) {
      this.grid.line(this.lastCell.x, this.lastCell.y, cell.x, cell.y, paint, 1)
    } else {
      this.grid.set(cell.x, cell.y, paint)
    }
    this.lastCell = cell
    this.redraw()
  },

  commitStroke() {
    if (!this.strokeSnapshot) return
    const after = this.grid.snapshot()
    const patch = core.diffSnapshot(this.strokeSnapshot, after, this.grid.width, this.grid.height)
    this.strokeSnapshot = null
    if (!patch) return
    this.undo.push(patch)
    this.updateStats()
  },

  // ---------- 撤销 / 保存 ----------

  undoAction() {
    if (!this.undo.undo(this.grid)) return
    this.redraw()
    this.updateStats()
  },

  redoAction() {
    if (!this.undo.redo(this.grid)) return
    this.redraw()
    this.updateStats()
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  persist() {
    if (!this.grid) return
    const rec = core.createProjectFile(this.grid, {
      id: this.docId,
      name: this.data.name || '未命名',
      done: this.done,
      finish: this.data.finishId,
      createdAt: this.createdAt
    })
    db.save(rec)
  },

  saveNow() {
    this.persist()
    wx.showToast({ title: '已保存到本机', icon: 'success' })
  },

  exportImage() {
    if (!this.renderer || !this.canvasNode) return
    wx.canvasToTempFilePath({
      canvas: this.canvasNode,
      fileType: 'png',
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => wx.showToast({ title: '已存到相册', icon: 'success' }),
          fail: () => wx.showToast({ title: '没权限存相册', icon: 'none' })
        })
      },
      fail: () => wx.showToast({ title: '导出失败', icon: 'none' })
    })
  }
})
