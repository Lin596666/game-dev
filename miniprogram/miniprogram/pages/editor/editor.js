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
      { id: 'picker', label: '吸管' },
      { id: 'line', label: '直线' },
      { id: 'rect', label: '矩形' },
      { id: 'ellipse', label: '椭圆' }
    ],
    sets: core.COLOR_SETS,
    setIndex: 0,
    swatches: [],
    colorId: 0,
    showNumbers: false,
    symmetry: 'none',
    showBoards: false,
    moreOpen: false,
    stepMode: false,
    stepIndex: 0,
    stepTotal: 0,
    minutes: 0,
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

  onShow() {
    this.startClock()
  },

  onHide() {
    this.stopClock()
    this.persist()
  },

  onUnload() {
    this.stopClock()
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
    let focus = null
    if (this.data.guideMode && this.data.stepMode) {
      const list = this.stepList()
      const i = list[Math.min(this.data.stepIndex, list.length - 1)]
      if (i !== undefined && i >= 0) {
        focus = { x: i % this.grid.width, y: Math.floor(i / this.grid.width) }
      }
    }
    return {
      mode: this.data.guideMode,
      done: this.data.guideMode ? this.done : null,
      colorId: this.data.guideMode ? this.data.guideColorId : 0,
      focus
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
      usageOptions: usage.map((u) => ({ value: u.id, label: u.color.code + ' ' + u.color.name + '（' + u.count + ' 颗）' })),
      guideColorId,
      guideLabel,
      stepTotal: this.data.stepMode ? this.stepList().length : 0,
      stepIndex: Math.min(this.data.stepIndex, Math.max(0, this.stepList().length - 1))
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

    // 形状：第一次点定起点，第二次点定终点（小程序不做拖拽预览，省一点性能）
    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      if (!isStart) return
      if (!this.shapeFrom) {
        this.shapeFrom = { x: cell.x, y: cell.y }
        wx.showToast({ title: '再点一下定另一端', icon: 'none' })
        return
      }
      const a = this.shapeFrom
      this.shapeFrom = null
      this.strokeSnapshot = this.grid.snapshot()
      if (tool === 'line') this.grid.line(a.x, a.y, cell.x, cell.y, color, 1)
      else if (tool === 'rect') this.grid.rect(a.x, a.y, cell.x, cell.y, color, false, 1)
      else this.grid.ellipse(a.x, a.y, cell.x, cell.y, color, false, 1)
      this.pushShapePatch()
      this.redraw()
      this.updateStats()
      return
    }

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
      this.paintMirrored(this.lastCell, cell, paint)
    } else {
      this.paintMirrored(cell, null, paint)
    }
    this.lastCell = cell
    this.redraw()
  },

  pushShapePatch() {
    if (!this.strokeSnapshot) return
    const after = this.grid.snapshot()
    const patch = core.diffSnapshot(this.strokeSnapshot, after, this.grid.width, this.grid.height)
    this.strokeSnapshot = null
    if (patch) this.undo.push(patch)
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

  copyList() {
    const text = core.instructionText(this.grid, this.data.name || '拼豆图纸')
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '色号清单已复制', icon: 'success' })
    })
  },

  // ---------- 更多面板：对称 / 变形 / 分步引导 / 分享码 / 工程文件 ----------

  openMore() {
    this.setData({ moreOpen: true })
  },

  closeMore() {
    this.setData({ moreOpen: false })
  },

  setSymmetry(e) {
    const v = e.currentTarget.dataset.v
    this.setData({ symmetry: v })
    wx.showToast({ title: v === 'none' ? '已关闭对称' : '对称绘制已开启', icon: 'none' })
  },

  toggleBoards() {
    const on = !this.data.showBoards
    this.setData({ showBoards: on })
    if (this.renderer) this.renderer.setOptions({ boardLines: on })
    this.redraw()
  },

  /** 把一笔（或一个点）按当前对称方式画出去 */
  paintMirrored(from, to, paint) {
    const w = this.grid.width
    const h = this.grid.height
    const variants = [{ fx: 1, fy: 1 }]
    const s = this.data.symmetry
    if (s === 'x' || s === 'quad') variants.push({ fx: -1, fy: 1 })
    if (s === 'y' || s === 'quad') variants.push({ fx: 1, fy: -1 })
    if (s === 'quad') variants.push({ fx: -1, fy: -1 })
    variants.forEach((v) => {
      const mapX = (c) => (v.fx < 0 ? w - 1 - c.x : c.x)
      const mapY = (c) => (v.fy < 0 ? h - 1 - c.y : c.y)
      if (to) this.grid.line(mapX(from), mapY(from), mapX(to), mapY(to), paint, 1)
      else this.grid.set(mapX(from), mapY(from), paint)
    })
  },

  transformGrid(e) {
    const kind = e.currentTarget.dataset.kind
    this.strokeSnapshot = this.grid.snapshot()
    this.grid.transform(kind)
    this.pushShapePatch()
    this.redraw()
    this.updateStats()
    this.persist()
    this.setData({ moreOpen: false })
  },

  rotate90Action() {
    this.grid = this.grid.rotated90()
    this.done = new Uint8Array(this.grid.width * this.grid.height)
    this.undo.clear()
    if (this.renderer) {
      this.renderer.setGrid(this.grid)
      this.renderer.fit()
    }
    this.setData({
      sizeText: this.grid.width + '×' + this.grid.height,
      progress: 0,
      moreOpen: false
    })
    this.redraw()
    this.updateStats()
    this.persist()
  },

  trimGrid() {
    const t = this.grid.trimmed()
    this.grid = t
    this.done = new Uint8Array(t.width * t.height)
    this.undo.clear()
    if (this.renderer) {
      this.renderer.setGrid(this.grid)
      this.renderer.fit()
    }
    this.setData({ sizeText: t.width + '×' + t.height, progress: 0, moreOpen: false })
    this.redraw()
    this.updateStats()
    this.persist()
  },

  clearGrid() {
    wx.showModal({
      title: '清空画布',
      content: '所有珠子都会消失，确定吗？（可以撤销）',
      success: (res) => {
        if (!res.confirm) return
        this.strokeSnapshot = this.grid.snapshot()
        this.grid.clear()
        this.done = new Uint8Array(this.grid.width * this.grid.height)
        this.pushShapePatch()
        this.redraw()
        this.updateStats()
        this.persist()
      }
    })
  },

  // 分步引导：每次现算「还剩哪些格子」，跳着拼也不会错位
  stepList() {
    const list = []
    const data = this.grid.data
    const gid = this.data.guideColorId
    for (let i = 0; i < data.length; i++) {
      const v = data[i]
      if (!v || this.done[i]) continue
      if (gid && v !== gid) continue
      list.push(i)
    }
    return list
  },

  toggleStep() {
    this.setData({ stepMode: !this.data.stepMode, stepIndex: 0 })
    this.updateStats()
    this.redraw()
  },

  nextStep() {
    const total = this.stepList().length
    this.setData({ stepIndex: Math.min(this.data.stepIndex + 1, Math.max(0, total - 1)) })
    this.updateStats()
    this.redraw()
  },

  prevStep() {
    this.setData({ stepIndex: Math.max(0, this.data.stepIndex - 1) })
    this.updateStats()
    this.redraw()
  },

  // 分享码 / 工程文件都走剪贴板，不需要服务器
  copyShare() {
    try {
      const code = core.encodeShare({
        name: this.data.name,
        width: this.grid.width,
        height: this.grid.height,
        cells: this.grid.data
      })
      wx.setClipboardData({
        data: code,
        success: () => {
          this.setData({ moreOpen: false })
          wx.showToast({ title: '分享码已复制', icon: 'success' })
        }
      })
    } catch (e) {
      wx.showToast({ title: '生成失败', icon: 'none' })
    }
  },

  importShare() {
    wx.getClipboardData({
      success: (res) => {
        const text = String(res.data || '').trim()
        let grid = null
        try {
          const payload = core.decodeShare(text)
          grid = new core.BeadGrid(payload.width, payload.height, payload.cells)
          if (payload.name) this.setData({ name: payload.name })
        } catch (e) {
          try {
            const parsed = core.parseProjectText(text)
            grid = parsed.grid
            if (parsed.name) this.setData({ name: parsed.name })
          } catch (e2) {
            wx.showToast({ title: '剪贴板里没有图纸', icon: 'none' })
            return
          }
        }
        this.grid = grid
        this.done = new Uint8Array(grid.width * grid.height)
        this.undo.clear()
        if (this.renderer) {
          this.renderer.setGrid(grid)
          this.renderer.fit()
        }
        this.setData({
          sizeText: grid.width + '×' + grid.height,
          progress: 0,
          moreOpen: false
        })
        this.redraw()
        this.updateStats()
        this.persist()
        wx.showToast({ title: '已导入图纸', icon: 'success' })
      }
    })
  },

  copyProject() {
    const json = JSON.stringify(
      core.createProjectFile(this.grid, {
        id: this.docId,
        name: this.data.name || '未命名',
        done: this.done,
        finish: this.data.finishId,
        createdAt: this.createdAt
      })
    )
    wx.setClipboardData({
      data: json,
      success: () => {
        this.setData({ moreOpen: false })
        wx.showToast({ title: '工程已复制', icon: 'success' })
      }
    })
  },

  copyPurchase() {
    const report = core.stockReport(this.grid, {}, 0)
    const text = core.purchaseText(report, this.data.name || '拼豆图纸')
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '采购清单已复制', icon: 'success' })
    })
  },

  // 配色替换：把图纸里某个色号整片换成当前选中的颜色
  onReplacePick(e) {
    const idx = Number(e.detail.value) || 0
    const opt = (this.data.usageOptions || [])[idx]
    if (!opt) return
    if (opt.value === this.data.colorId) {
      wx.showToast({ title: '已经就是这个颜色了', icon: 'none' })
      return
    }
    this.strokeSnapshot = this.grid.snapshot()
    this.grid.replaceColor(opt.value, this.data.colorId)
    this.pushShapePatch()
    this.redraw()
    this.updateStats()
    this.persist()
    wx.showToast({ title: '整片换成当前色了', icon: 'success' })
  },

  startClock() {
    if (this.clockTimer) return
    this.clockStart = Date.now()
    this.clockTimer = setInterval(() => {
      const m = Math.floor((Date.now() - this.clockStart) / 60000)
      if (m !== this.data.minutes) {
        this.setData({ minutes: m })
        if (m > 0 && m % 45 === 0) {
          wx.vibrateShort({ type: 'medium' })
          wx.showToast({ title: '坐了挺久，起来动一动 🌿', icon: 'none' })
        }
      }
    }, 15000)
  },

  stopClock() {
    if (this.clockTimer) clearInterval(this.clockTimer)
    this.clockTimer = null
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
