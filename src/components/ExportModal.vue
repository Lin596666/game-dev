<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { instructionText } from '@/core/pattern'
import { useEditorStore } from '@/store/editor'
import {
  canvasToBlob,
  downloadBlob,
  downloadText,
  renderPng,
  renderShareCard,
  renderWallShot,
  renderPatternSheet
} from '@/renderer/export'
import Modal from './Modal.vue'

const store = useEditorStore()

const emit = defineEmits<{ (e: 'close'): void; (e: 'share'): void }>()

const pxPerCell = ref(12)
const showGrid = ref(false)
const showNumbers = ref(false)
const withLegend = ref(true)
const transparent = ref(false)
const crop = ref(true)
const busy = ref(false)
const preview = ref('')
const message = ref('')

const safeName = computed(() => (store.docName || '拼豆图纸').replace(/[\\/:*?"<>|]/g, '_'))

function buildPreview(): void {
  try {
    const { canvas } = renderPng(store.grid, {
      pxPerCell: 6,
      showGrid: showGrid.value,
      showNumbers: false,
      withLegend: withLegend.value,
      transparent: transparent.value,
      paperColor: '#FBF7F1',
      crop: crop.value,
      name: store.docName,
      finish: store.finish
    })
    preview.value = canvas.toDataURL('image/png')
  } catch {
    preview.value = ''
  }
}

watch([showGrid, withLegend, transparent, crop], buildPreview, { immediate: true })

async function exportCard(): Promise<void> {
  busy.value = true
  try {
    const { canvas } = renderShareCard(store.grid, {
      name: store.docName || '拼豆作品',
      beads: store.total,
      width: store.grid.width,
      height: store.grid.height,
      finishName: store.finish === 'raw' ? '' : store.finishInfo.name
    })
    const blob = await canvasToBlob(canvas)
    downloadBlob(blob, `${safeName.value}-分享卡.png`)
    message.value = '分享卡片已下载（1080×1350）'
  } catch (err) {
    message.value = err instanceof Error ? err.message : '生成分享卡失败'
  } finally {
    busy.value = false
  }
}

async function exportSheet(): Promise<void> {
  busy.value = true
  try {
    const { canvas } = renderPatternSheet(store.grid, {
      name: store.docName || '拼豆图纸',
      finish: store.finish
    })
    const blob = await canvasToBlob(canvas)
    downloadBlob(blob, safeName.value + '-图纸页.png')
    message.value = '图纸页已下载（A4 比例 1240×1754）'
  } catch (err) {
    message.value = err instanceof Error ? err.message : '生成图纸页失败'
  } finally {
    busy.value = false
  }
}

async function exportWall(): Promise<void> {
  busy.value = true
  try {
    const { canvas } = renderWallShot(store.grid, {
      name: store.docName || '拼豆作品',
      beads: store.total,
      width: store.grid.width,
      height: store.grid.height,
      finishName: store.finish === 'raw' ? '' : store.finishInfo.name
    })
    const blob = await canvasToBlob(canvas)
    downloadBlob(blob, safeName.value + '-挂墙效果.png')
    message.value = '挂墙效果图已下载（1080×1350）'
  } catch (err) {
    message.value = err instanceof Error ? err.message : '生成挂墙效果图失败'
  } finally {
    busy.value = false
  }
}

async function exportPng(): Promise<void> {
  busy.value = true
  try {
    const { canvas } = renderPng(store.grid, {
      pxPerCell: pxPerCell.value,
      showGrid: showGrid.value,
      showNumbers: showNumbers.value,
      withLegend: withLegend.value,
      transparent: transparent.value,
      paperColor: '#FBF7F1',
      crop: crop.value,
      name: store.docName,
      finish: store.finish
    })
    const blob = await canvasToBlob(canvas)
    downloadBlob(blob, `${safeName.value}.png`)
    message.value = `已导出 PNG（${canvas.width}×${canvas.height}）`
  } catch (err) {
    message.value = err instanceof Error ? err.message : '导出失败'
  } finally {
    busy.value = false
  }
}

function exportProject(): void {
  downloadText(store.projectFileJson(), `${safeName.value}.beads.json`, 'application/json')
  message.value = '工程文件已导出，换设备时再导入即可'
}

function exportList(): void {
  const text = instructionText(store.grid, store.docName)
  downloadText(text, `${safeName.value}-色号清单.txt`)
  message.value = '色号清单已导出，可以对着单子备料'
}

async function saveNow(): Promise<void> {
  await store.persist()
  message.value = '已保存到本机'
}
</script>

<template>
  <Modal title="导出" wide @close="emit('close')">
    <div class="preview-wrap">
      <div class="preview-box" style="flex-shrink: 1; min-width: 0">
        <img
          v-if="preview"
          :src="preview"
          alt="导出预览"
          style="max-width: 300px; max-height: 260px; image-rendering: pixelated"
        />
        <div v-else class="hint" style="width: 200px; text-align: center; padding: 40px 0">
          画布还是空的
        </div>
      </div>

      <div style="flex: 1; min-width: 220px">
        <div class="field">
          <label>每格像素（打印清晰度）</label>
          <div class="seg">
            <button v-for="n in [8, 12, 16, 20]" :key="n" :class="{ on: pxPerCell === n }" @click="pxPerCell = n">
              {{ n }}px
            </button>
          </div>
        </div>

        <label class="usage-item" style="cursor: pointer" @click.prevent="showGrid = !showGrid">
          <input type="checkbox" :checked="showGrid" /> 画网格线
        </label>
        <label class="usage-item" style="cursor: pointer" @click.prevent="showNumbers = !showNumbers">
          <input type="checkbox" :checked="showNumbers" /> 格子里写色号
        </label>
        <label class="usage-item" style="cursor: pointer" @click.prevent="withLegend = !withLegend">
          <input type="checkbox" :checked="withLegend" /> 附色号清单
        </label>
        <label class="usage-item" style="cursor: pointer" @click.prevent="crop = !crop">
          <input type="checkbox" :checked="crop" /> 裁掉四周空白
        </label>
        <label class="usage-item" style="cursor: pointer" @click.prevent="transparent = !transparent">
          <input type="checkbox" :checked="transparent" /> 透明背景
        </label>

        <p class="hint" style="margin-top: 10px">
          共 {{ store.total }} 颗豆子、{{ store.usage.length }} 个色号，约 ¥{{ store.cost.toFixed(2) }}
        </p>
        <p v-if="message" class="hint" style="color: #3a342e">{{ message }}</p>
      </div>
    </div>

    <template #footer>
      <button class="btn" @click="emit('close')">关闭</button>
      <button class="btn" @click="exportCard">分享卡片</button>
      <button class="btn" @click="exportWall">挂墙效果图</button>
      <button class="btn" @click="exportSheet">图纸页</button>
      <button class="btn" @click="exportList">色号清单</button>
      <button class="btn" @click="exportProject">工程文件</button>
      <button class="btn" @click="saveNow">保存到本机</button>
      <button class="btn" @click="emit('share')">分享给朋友</button>
      <button class="btn primary" :disabled="busy || !store.total" @click="exportPng">
        {{ busy ? '导出中…' : '下载 PNG' }}
      </button>
    </template>
  </Modal>
</template>
