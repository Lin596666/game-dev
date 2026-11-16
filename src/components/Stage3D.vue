<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { colorById } from '@/core/colors'
import { Bead3DStage } from '@/renderer/Bead3DStage'
import { useEditorStore } from '@/store/editor'

const store = useEditorStore()

const host = ref<HTMLDivElement | null>(null)
const hoverCell = ref<{ x: number; y: number } | null>(null)
const autoRotate = ref(false)
const failed = ref('')
const beadCount = ref(0)

let stage: Bead3DStage | null = null

function paintAt(x: number, y: number): void {
  const tool = store.tool
  if (tool === 'eyedropper') {
    const id = store.pickAt(x, y)
    if (id) store.colorId = id
    return
  }
  if (tool === 'eraser') {
    store.beginStroke()
    store.eraseCell(x, y)
    store.endStroke()
    return
  }
  if (tool === 'bucket') {
    store.beginStroke()
    store.bucketAt(x, y)
    store.endStroke()
    return
  }
  // 形状工具在 3D 里退化成"点一颗"——立体视图不适合拖形状，先按点处理
  store.beginStroke()
  store.paintCell(x, y)
  store.endStroke()
}

function syncCount(): void {
  beadCount.value = store.grid.usedCount()
}

onMounted(() => {
  if (!host.value) return
  try {
    stage = new Bead3DStage(host.value, {
      onClick: paintAt,
      onHover: (cell) => (hoverCell.value = cell)
    })
    stage.setGrid(store.grid)
    stage.setAutoRotate(autoRotate.value)
    stage.setFinish(store.finish)
    syncCount()
  } catch (err) {
    failed.value = err instanceof Error ? err.message : String(err)
  }
})

watch(
  () => store.grid,
  (g) => {
    stage?.setGrid(g)
    syncCount()
  }
)

watch(
  () => store.gridVersion,
  () => {
    stage?.refresh()
    syncCount()
  }
)

watch(autoRotate, (on) => stage?.setAutoRotate(on))
watch(
  () => store.finish,
  (id) => stage?.setFinish(id)
)
onBeforeUnmount(() => {
  stage?.dispose()
  stage = null
})

function hoverColorName(): string {
  const c = hoverCell.value
  if (!c) return ''
  const id = store.grid.get(c.x, c.y)
  return id ? (colorById(id)?.name ?? '') : '空格'
}
</script>

<template>
  <div class="stage stage-3d">
    <div ref="host" class="stage-3d-host"></div>

    <div v-if="failed" class="stage-3d-fail">
      <p>3D 视图打不开：{{ failed }}</p>
      <p class="muted">可能是这台设备不支持 WebGL，切回 2D 继续拼就好。</p>
    </div>

    <div class="stage-pill side">
      <span class="stage-3d-count">{{ beadCount }} 颗</span>
      <span v-if="hoverCell" class="stage-3d-pos">
        第 {{ hoverCell.y + 1 }} 行 · 第 {{ hoverCell.x + 1 }} 列
        <em v-if="hoverColorName()">{{ hoverColorName() }}</em>
      </span>
      <span v-else class="muted">拖动旋转 · 滚轮缩放 · 点格子直接拼</span>
    </div>

    <div class="stage-pill floor">
      <button
        class="btn sm"
        :class="{ primary: store.finish !== 'raw' }"
        title="把珠子压扁，看熨烫后的成品"
        @click="store.setFinish(store.finish === 'raw' ? 'cloth' : 'raw')"
      >
        {{ store.finish === 'raw' ? '熨烫' : store.finishInfo.name }}
      </button>
      <button class="btn sm" title="回到正面视角" @click="stage?.resetView()">正视角</button>
      <button
        class="btn sm"
        :class="{ primary: autoRotate }"
        title="让盘子自己慢慢转"
        @click="autoRotate = !autoRotate"
      >
        自动旋转
      </button>
    </div>
  </div>
</template>
