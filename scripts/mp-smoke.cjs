/**
 * 小程序端逻辑冒烟测试：用假的 wx / canvas 环境把 pages/editor/editor.js 跑起来，
 * 真实调用它的 onLoad / 触摸绘制 / 撤销 / 对称 / 分享码 / 工程文件 / 分步引导，
 * 断言每一步的结果。跑法：node scripts/mp-smoke.cjs
 */
const path = require('node:path')
const fs = require('node:fs')
const vm = require('node:vm')

// 根目录 package.json 是 "type": "module"，小程序代码却是 CommonJS，
// 这里用 vm 把每个文件当 CJS 编译，require 走自己的解析（只在测试里用）
const cjsCache = new Map()
function loadCjs(file) {
  const full = path.resolve(file)
  if (cjsCache.has(full)) return cjsCache.get(full)
  const src = fs.readFileSync(full, 'utf8')
  const mod = { exports: {} }
  cjsCache.set(full, mod.exports)
  const dir = path.dirname(full)
  const req = (spec) => {
    if (spec.startsWith('.')) {
      let p = path.resolve(dir, spec)
      if (!fs.existsSync(p)) p += '.js'
      if (fs.statSync(p).isDirectory()) p = path.join(p, 'index.js')
      return loadCjs(p)
    }
    return require(spec)
  }
  const fn = vm.compileFunction(src, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: full })
  fn(mod.exports, req, mod, full, dir)
  cjsCache.set(full, mod.exports)
  return mod.exports
}
const assert = require('node:assert')

const ROOT = path.resolve(__dirname, '..', 'miniprogram', 'miniprogram')

let clipboard = ''
const storage = new Map()

const ctx = new Proxy(
  {
    canvas: {},
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    setLineDash() {},
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
  },
  {
    get(target, key) {
      if (key in target) return target[key]
      return () => {}
    },
    set(target, key, value) {
      target[key] = value
      return true
    }
  }
)

function fakeNode() {
  return { width: 320, height: 420, getContext: () => ctx, createImage: () => ({}) }
}

function queryFactory() {
  const res = [{ node: fakeNode(), width: 320, height: 420 }]
  return {
    select: () => ({
      fields: () => ({
        exec: (cb) => {
          if (cb) cb(res)
        }
      }),
      boundingClientRect: (cb) => ({
        exec: () => {
          if (cb) cb({ left: 0, top: 0, width: 320, height: 420 })
        }
      })
    })
  }
}

global.getApp = () => ({ globalData: {} })
global.wx = {
  createSelectorQuery: queryFactory,
  getWindowInfo: () => ({ pixelRatio: 2, windowWidth: 320, windowHeight: 420 }),
  getSystemInfoSync: () => ({ pixelRatio: 2, windowWidth: 320, windowHeight: 420 }),
  createOffscreenCanvas: () => fakeNode(),
  getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
  setStorageSync: (k, v) => storage.set(k, v),
  removeStorageSync: (k) => storage.delete(k),
  showToast: () => {},
  showModal: ({ success }) => success && success({ confirm: true }),
  showActionSheet: ({ success }) => success && success({ tapIndex: 0 }),
  vibrateShort: () => {},
  setClipboardData: ({ data, success }) => {
    clipboard = data
    success && success()
  },
  getClipboardData: ({ success }) => success({ data: clipboard }),
  canvasToTempFilePath: ({ success }) => success({ tempFilePath: 'x.png' }),
  saveImageToPhotosAlbum: ({ success }) => success(),
  chooseMedia: () => {},
  vibrateLong: () => {}
}

let pageConfig = null
global.Page = (cfg) => {
  pageConfig = cfg
}

loadCjs(path.join(ROOT, 'pages/editor/editor.js'))
assert.ok(pageConfig, 'editor.js 没有调用 Page()')

const page = Object.assign({}, pageConfig)
page.data = JSON.parse(JSON.stringify(pageConfig.data))
page.setData = function (patch, cb) {
  Object.assign(this.data, patch)
  if (cb) cb()
}

const core = loadCjs(path.join(ROOT, 'core/index.js'))

// ---------- 1. 打开内置图纸 ----------
page.onLoad({ lib: 'heart-29' })
page.onShow()
page.onReady()
assert.ok(page.renderer, '渲染器没有初始化')
assert.strictEqual(page.grid.width, 29)
assert.ok(page.grid.usedCount() > 40, '内置图纸应该有珠子')
const total0 = page.data.total
assert.ok(total0 > 0, 'updateStats 没算出总颗数')
console.log('✓ 加载图纸', total0, '颗')

// ---------- 2. 手指画一笔 ----------
const before = page.grid.usedCount()
page.setData({ colorId: 1 })
page.onTouchStart({ touches: [{ clientX: 60, clientY: 60 }] })
page.onTouchMove({ touches: [{ clientX: 90, clientY: 90 }] })
page.onTouchEnd()
assert.ok(page.grid.usedCount() >= before, '画完之后颗数不该减少')
assert.ok(page.undo.canUndo, '画一笔之后应该能撤销')
console.log('✓ 触摸绘制 + 撤销栈')

// ---------- 3. 撤销 / 重做 ----------
const afterPaint = page.grid.usedCount()
page.undoAction()
page.redoAction()
assert.strictEqual(page.grid.usedCount(), afterPaint, '撤销再重做应该回到原样')
console.log('✓ 撤销 / 重做')

// ---------- 4. 四向对称 ----------
let emptyCell = null
for (let y = 0; y < page.grid.height && !emptyCell; y++) {
  for (let x = 0; x < page.grid.width; x++) {
    if (!page.grid.data[y * page.grid.width + x]) {
      emptyCell = { x, y }
      break
    }
  }
}
assert.ok(emptyCell, '画布已经满了，没法测对称')
const r = page.renderer
const sx = r.ox + (emptyCell.x + 0.5) * r.zoom
const sy = r.oy + (emptyCell.y + 0.5) * r.zoom
const bt = page.grid
const { BeadGrid } = core
page.grid = new BeadGrid(bt.width, bt.height)
page.done = new Uint8Array(bt.width * bt.height)
page.renderer.setGrid(page.grid)
page.setSymmetry({ currentTarget: { dataset: { v: 'quad' } } })
page.onTouchStart({ touches: [{ clientX: sx, clientY: sy }] })
page.onTouchEnd()
page.setSymmetry({ currentTarget: { dataset: { v: 'none' } } })
assert.strictEqual(page.grid.usedCount(), 4, '四向对称在一个点上应该画出 4 颗，实际 ' + page.grid.usedCount())
page.grid = bt
page.renderer.setGrid(bt)
console.log('✓ 对称绘制（四向）单点画出 4 颗')

// ---------- 5. 形状工具：直线 ----------
page.setData({ tool: 'line', colorId: 2 })
page.onTouchStart({ touches: [{ clientX: 30, clientY: 200 }] })
page.onTouchEnd()
page.onTouchStart({ touches: [{ clientX: 150, clientY: 200 }] })
page.onTouchEnd()
assert.ok(page.undo.canUndo, '直线应该进撤销栈')
page.setData({ tool: 'pen' })
console.log('✓ 形状工具（两点直线）')

// ---------- 6. 分步引导 ----------
page.setData({ guideMode: true, guideColorId: 0 })
page.toggleStep()
assert.strictEqual(page.data.stepMode, true)
assert.ok(page.data.stepTotal > 0, '分步引导应该算出剩余颗数')
const focus = page.guideState().focus
assert.ok(focus && focus.x >= 0 && focus.y >= 0, '分步引导应该给出光标位置')
page.nextStep()
page.prevStep()
console.log('✓ 分步引导 剩余', page.data.stepTotal, '光标', JSON.stringify(focus))

// ---------- 7. 分享码 & 工程文件 ----------
page.copyShare()
const code = clipboard
assert.ok(code.startsWith('b1.'), '分享码格式不对: ' + code.slice(0, 12))
const payload = core.decodeShare(code)
assert.strictEqual(payload.width, page.grid.width)
assert.strictEqual(payload.cells.length, page.grid.data.length)
assert.deepStrictEqual(Array.from(payload.cells), Array.from(page.grid.data), '分享码还原后内容要一致')
console.log('✓ 分享码往返', code.length, '字符')

page.copyProject()
const json = JSON.parse(clipboard)
assert.strictEqual(json.width, page.grid.width)
assert.ok(json.cells, '工程文件里没有 cells')
console.log('✓ 工程文件', clipboard.length, '字符')

// 把分享码粘回去导入
page.setData({ moreOpen: true })
page.importShare()
assert.strictEqual(page.grid.width, payload.width)
console.log('✓ 从剪贴板导入图纸')

// ---------- 8. 变形 / 豆板线 / 计时 ----------
const w0 = page.grid.width
page.transformGrid({ currentTarget: { dataset: { kind: 'flipX' } } })
page.transformGrid({ currentTarget: { dataset: { kind: 'rotate180' } } })
assert.strictEqual(page.grid.width, w0)
page.rotate90Action()
assert.strictEqual(page.grid.width, page.grid.height === w0 ? w0 : page.grid.width)
page.setData({ showBoards: false })
page.toggleBoards()
assert.strictEqual(page.data.showBoards, true)
page.startClock()
page.stopClock()
console.log('✓ 变形 / 豆板线 / 计时')

// ---------- 8b. 配色替换 ----------
const usage = core.colorUsage(page.grid)
assert.ok(usage.length >= 1, '测试图纸应该有颜色')
const from = usage[0].color.id
const to = page.grid.data.find((v) => v && v !== from) || 1
page.setData({ colorId: to })
const beforeCount = page.grid.usedCount()
page.onReplacePick({ detail: { value: 0 } })
assert.strictEqual(page.grid.usedCount(), beforeCount, '配色替换不该改变颗数')
assert.ok(!page.grid.data.includes(from), '配色替换之后不该还有旧色号')
console.log('✓ 配色替换', from, '→', to)

// ---------- 9. 保存与再打开 ----------
page.persist()
const dbMod = loadCjs(path.join(ROOT, 'utils/db.js'))
const list = dbMod.list()
assert.ok(list.length >= 1, '保存之后作品列表应该有记录')
page.setData({ name: '冒烟测试作品' })
page.saveNow()
const rec = dbMod.list().find((r) => r.name === '冒烟测试作品')
assert.ok(rec, '保存的作品应该在列表里')
console.log('✓ 保存到本机存储', list.length, '条')

// ---------- 10. 首页（作品列表 + 图纸库） ----------
pageConfig = null
loadCjs(path.join(ROOT, 'pages/index/index.js'))
assert.ok(pageConfig, 'index.js 没有调用 Page()')
const home = Object.assign({}, pageConfig)
home.data = JSON.parse(JSON.stringify(pageConfig.data))
home.setData = function (patch, cb) {
  Object.assign(this.data, patch)
  if (cb) cb()
}
home.onShow()
assert.ok(Array.isArray(home.data.works), '首页没有作品列表')
assert.ok(Array.isArray(home.data.library) && home.data.library.length >= 8, '内置图纸应该至少 8 张')

console.log('✓ 首页：' + home.data.library.length + ' 张图纸 / ' + home.data.works.length + ' 个作品')

console.log('\n全部通过：小程序端首页与编辑器逻辑都跑通了')
