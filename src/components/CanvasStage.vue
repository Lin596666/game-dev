<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { BeadRenderer, MAX_ZOOM, MIN_ZOOM, type PreviewPatch } from '@/renderer/BeadRenderer'

const store = useEditorStore()

const stageEl = ref<HTMLDivElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

let renderer: BeadRenderer | null = null
let ro: ResizeObserver | null = null

const zoomPct = ref(100)

type Mode = 'none' | 'paint' | 'erase' | 'shape' | 'pan' | 'select'
let mode: Mode = 'none'
let lastCell = { x: 0, y: 0 }
let shapeStart = { x: 0, y: 0 }
let selStart = { x: 0, y: 0 }
let panStart = { px: 0, py: 0, ox: 0, oy: 0 }

const pointers = new Map<number, { x: number; y: number }>()
let pinch: { dist: number; zoom: number; ox: number; oy: number; midX: number; midY: number } | null =
  null

const hint = computed(() => {
  if (store.guideMode) return '跟拼模式：点一下格子就算放好一颗 · 双指缩放'
  const map: Record<string, string> = {
    pencil: '拖动绘制 · 滚轮/双指缩放 · 空格拖动平移',
    eraser: '拖动擦除',
    bucket: '点一下填满同色区域',
    eyedropper: '点一下吸取颜色',
    line: '拖动画直线',
    rect: '拖动画矩形边框',
    rectFill: '拖动画实心矩形',
    ellipse: '拖动画椭圆边框',
    ellipseFill: '拖动画实心椭圆',
    select: '拖动框选，可复制/剪切/粘贴'
  }
  return map[store.tool] ?? ''
})

function syncView(): void {
  if (!renderer) return
  zoomPct.value = Math.round(renderer.getView().zoom * 100)
}

function localPoint(e: PointerEvent): { px: number; py: number } {
  const rect = canvasEl.value!.getBoundingClientRect()
  return { px: e.clientX - rect.left, py: e.clientY - rect.top }
}

function cellAt(px: number, py: number): { x: number; y: number } {
  return renderer ? renderer.screenToCell(px, py) : { x: -1, y: -1 }
}

/** 快速移动时补上中间格，避免出现断点 */
function paintLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  erase: boolean
): void {
  let dx = Math.abs(x1 - x0)
  let dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  for (let guard = 0; guard < 4096; guard++) {
    if (erase) store.eraseCell(x, y)
    else store.paintCell(x, y)
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
}

function startPinch(): void {
  const pts = [...pointers.values()]
  if (pts.length < 2 || !renderer) return
  const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }]
  const v = renderer.getView()
  pinch = {
    dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    zoom: v.zoom,
    ox: v.offsetX,
    oy: v.offsetY,
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2
  }
  mode = 'none'
  store.cancelStroke()
  renderer.setPreview(null)
}

function onPointerDown(e: PointerEvent): void {
  if (!renderer || !canvasEl.value) return
  canvasEl.value.setPointerCapture(e.pointerId)
  const { px, py } = localPoint(e)
  pointers.set(e.pointerId, { x: px, y: py })

  if (pointers.size === 2) {
    startPinch()
    return
  }
  if (pointers.size > 2) return

  const cell = cellAt(px, py)

  // 中键 / Alt = 平移
  if (e.button === 1 || e.altKey) {
    mode = 'pan'
    panStart = { px, py, ox: 0, oy: 0 }
    return
  }
  if (e.button === 2) return

  if (store.guideMode && store.tool === 'pencil') {
    if (cell.x >= 0 && cell.y >= 0) store.toggleDoneAt(cell.x, cell.y)
    mode = 'none'
    return
  }

  switch (store.tool) {
    case 'pencil': {
      store.beginStroke()
      mode = 'paint'
      store.paintCell(cell.x, cell.y)
      lastCell = cell
      break
    }
    case 'eraser': {
      store.beginStroke()
      mode = 'erase'
      store.eraseCell(cell.x, cell.y)
      lastCell = cell
      break
    }
    case 'bucket':
      store.bucketAt(cell.x, cell.y)
      mode = 'none'
      break
    case 'eyedropper':
      store.pickAt(cell.x, cell.y)
      mode = 'none'
      break
    case 'line':
    case 'rect':
    case 'rectFill':
    case 'ellipse':
    case 'ellipseFill':
      store.beginStroke()
      mode = 'shape'
      shapeStart = cell
      break
    case 'select':
      mode = 'select'
      selStart = cell
      store.setSelection({ x: cell.x, y: cell.y, w: 1, h: 1 })
      break
    default:
      mode = 'none'
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!renderer) return
  const prev = pointers.get(e.pointerId)
  const { px, py } = localPoint(e)
  if (prev) {
    prev.x = px
    prev.y = py
  }

  if (pinch && pointers.size >= 2) {
    const pts = [...pointers.values()]
    const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }]
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    const factor = dist / pinch.dist
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.zoom * factor))
    const ratio = zoom / pinch.zoom
    renderer.setView({
      zoom,
      offsetX: midX - (pinch.midX - pinch.ox) * ratio,
      offsetY: midY - (pinch.midY - pinch.oy) * ratio
    })
    syncView()
    return
  }

  const cell = cellAt(px, py)

  switch (mode) {
    case 'paint':
      paintLine(lastCell.x, lastCell.y, cell.x, cell.y, false)
      lastCell = cell
      break
    case 'erase':
      paintLine(lastCell.x, lastCell.y, cell.x, cell.y, true)
      lastCell = cell
      break
    case 'shape': {
      const kind = store.tool as 'line' | 'rect' | 'rectFill' | 'ellipse' | 'ellipseFill'
      const patch = store.previewShape(kind, shapeStart, cell) as PreviewPatch
      renderer.setPreview(patch)
      break
    }
    case 'select': {
      const x = Math.min(selStart.x, cell.x)
      const y = Math.min(selStart.y, cell.y)
      const w = Math.abs(cell.x - selStart.x) + 1
      const h = Math.abs(cell.y - selStart.y) + 1
      store.setSelection({ x, y, w, h })
      break
    }
    case 'pan': {
      const v = renderer.getView()
      renderer.setView({
        zoom: v.zoom,
        offsetX: v.offsetX + (px - panStart.px),
        offsetY: v.offsetY + (py - panStart.py)
      })
      panStart.px = px
      panStart.py = py
      break
    }
    default:
      break
  }
}

function onPointerUp(e: PointerEvent): void {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinch = null
  if (canvasEl.value?.hasPointerCapture(e.pointerId)) {
    canvasEl.value.releasePointerCapture(e.pointerId)
  }

  if (mode === 'paint' || mode === 'erase') {
    store.endStroke()
  } else if (mode === 'shape') {
    const kind = store.tool as 'line' | 'rect' | 'rectFill' | 'ellipse' | 'ellipseFill'
    const p = localPoint(e)
    const cell = cellAt(p.px, p.py)
    store.cancelStroke()
    store.commitShape(kind, shapeStart, cell)
    renderer?.setPreview(null)
  }
  mode = 'none'
}

function onWheel(e: WheelEvent): void {
  if (!renderer) return
  e.preventDefault()
  const rect = canvasEl.value!.getBoundingClientRect()
  const factor = Math.exp(-e.deltaY * 0.0016)
  renderer.zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top)
  syncView()
}

function zoomIn(): void {
  if (!renderer) return
  const el = canvasEl.value!
  renderer.setView(renderer.zoomAt(1.25, el.clientWidth / 2, el.clientHeight / 2))
  syncView()
}

function zoomOut(): void {
  if (!renderer) return
  const el = canvasEl.value!
  renderer.setView(renderer.zoomAt(1 / 1.25, el.clientWidth / 2, el.clientHeight / 2))
  syncView()
}

function fit(): void {
  if (!renderer) return
  renderer.fitToView()
  syncView()
}

function onContextMenu(e: Event): void {
  e.preventDefault()
}

onMounted(() => {
  if (!canvasEl.value || !stageEl.value) return
  renderer = new BeadRenderer(canvasEl.value)
  renderer.setGrid(store.grid)
  renderer.setOptions({
    style: store.style,
    showGrid: store.showGrid,
    showNumbers: store.showNumbers,
    showRulers: true,
    paperColor: '#FBF7F1'
  })

  const resize = () => {
    if (!renderer || !stageEl.value) return
    renderer.resize(stageEl.value.clientWidth, stageEl.value.clientHeight)
    renderer.fitToView()
    syncView()
  }
  ro = new ResizeObserver(resize)
  ro.observe(stageEl.value)
  resize()
})

onBeforeUnmount(() => {
  ro?.disconnect()
})

watch(
  () => store.gridVersion,
  () => {
    renderer?.invalidate()
    if (renderer) {
      renderer.setGuide({
        highlight: store.guideHighlight,
        done: store.guideDoneMask,
        focus: store.guideFocus
      })
    }
  }
)

watch(
  () => [store.guideHighlight, store.guideDoneMask, store.guideFocus] as const,
  ([h, d, f]) => {
    renderer?.setGuide({ highlight: h, done: d, focus: f })
    renderer?.invalidate()
  },
  { deep: false }
)

watch(
  () => store.grid,
  (g) => {
    renderer?.setGrid(g)
    renderer?.fitToView()
    syncView()
  }
)

watch(
  () => [store.style, store.showGrid, store.showNumbers],
  () => {
    renderer?.setOptions({
      style: store.style,
      showGrid: store.showGrid,
      showNumbers: store.showNumbers
    })
  }
)

watch(
  () => store.selection,
  (s) => renderer?.setSelection(s)
)
</script>

<template>
  <div ref="stageEl" class="stage">
    <canvas
      ref="canvasEl"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
      @contextmenu="onContextMenu"
    />
    <div class="stage-hint">{{ hint }}</div>
    <div class="stage-pill">
      <button class="btn ghost icon" title="缩小" @click="zoomOut">−</button>
      <span class="zoom-label">{{ zoomPct }}%</span>
      <button class="btn ghost icon" title="放大" @click="zoomIn">＋</button>
      <button class="btn sm ghost" @click="fit">适应</button>
    </div>
  </div>
</template>
