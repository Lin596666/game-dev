<script setup lang="ts">
import { shallowRef, ref, watch } from 'vue'
import { COLOR_SETS, type ColorSetId } from '@/core/colors'
import { BeadGrid } from '@/core/grid'
import { quantizeImage } from '@/core/quantize'
import { renderThumbnail } from '@/renderer/export'
import Modal from './Modal.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', payload: { width: number; height: number; data: Uint16Array }): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const source = shallowRef<{ data: Uint8ClampedArray; width: number; height: number } | null>(null)
const srcName = ref('')

const targetWidth = ref(48)
const maxColors = ref(0)
const dither = ref(false)
const stripBg = ref(false)
const colorSet = ref<ColorSetId | 'all'>('all')

const preview = ref('')
const result = shallowRef<{ width: number; height: number; data: Uint16Array } | null>(null)
const error = ref('')
const busy = ref(false)

function pick(): void {
  fileInput.value?.click()
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = ''
  srcName.value = file.name
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, 1100 / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h)
    source.value = { data: data.data, width: w, height: h }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '图片读取失败'
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('这张图好像读不出来，换一张试试'))
    img.src = url
  })
}

function compute(): void {
  const src = source.value
  if (!src) return
  busy.value = true
  try {
    const w = Math.min(160, Math.max(8, Math.round(targetWidth.value)))
    const h = Math.max(1, Math.round((w * src.height) / src.width))
    const res = quantizeImage(src, {
      targetWidth: w,
      targetHeight: Math.min(160, h),
      set: colorSet.value === 'all' ? undefined : colorSet.value,
      maxColors: maxColors.value,
      dither: dither.value,
      stripBackground: stripBg.value,
      bgTolerance: 14
    })
    result.value = { width: w, height: Math.min(160, h), data: res.data }
    const grid = new BeadGrid(w, Math.min(160, h), res.data)
    preview.value = renderThumbnail(grid, 260)
    error.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : '转换失败'
  } finally {
    busy.value = false
  }
}

watch([source, targetWidth, maxColors, dither, colorSet, stripBg], compute)

function apply(): void {
  const r = result.value
  if (!r) return
  emit('apply', { width: r.width, height: r.height, data: r.data })
}
</script>

<template>
  <Modal title="导入图片转图纸" wide @close="emit('close')">
    <div v-if="!source" class="empty" style="padding: 40px 10px">
      <p style="margin: 0 0 14px">选一张图片，自动转成拼豆图纸</p>
      <button class="btn primary" @click="pick">选择图片</button>
      <p class="hint" style="margin-top: 14px">
        建议：主体清楚、背景简单、颜色不要太多。二次元头像、小图标效果最好；照片容易糊成一团。
      </p>
    </div>

    <div v-else class="preview-wrap">
      <div class="preview-box">
        <img v-if="preview" :src="preview" alt="预览" style="width: 240px; image-rendering: pixelated" />
        <div v-else class="hint" style="width: 240px; text-align: center; padding: 40px 0">
          {{ busy ? '转换中…' : '等待预览' }}
        </div>
      </div>

      <div style="flex: 1; min-width: 0">
        <div class="field">
          <label>图纸宽度（格）</label>
          <input v-model.number="targetWidth" class="input" type="number" min="8" max="160" />
        </div>
        <div class="field">
          <label>颜色数量上限（0 = 不限制）</label>
          <input v-model.number="maxColors" class="input" type="number" min="0" max="48" />
        </div>
        <div class="field">
          <label>限定色卡</label>
          <select v-model="colorSet" class="select">
            <option value="all">全部色号</option>
            <option v-for="s in COLOR_SETS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </div>
        <label class="usage-item" style="cursor: pointer" @click.prevent="dither = !dither">
          <input type="checkbox" :checked="dither" />
          抖动（细节更多，但噪点也更碎）
        </label>
        <label class="usage-item" style="cursor: pointer" @click.prevent="stripBg = !stripBg">
          <input type="checkbox" :checked="stripBg" />
          去掉背景（拍成品照片时，白底/桌面会被留空）
        </label>
        <p v-if="error" class="hint" style="color: #a63b2b">{{ error }}</p>
        <p v-if="srcName" class="hint" style="margin-top: 8px">来源：{{ srcName }}</p>
      </div>
    </div>

    <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile" />

    <template #footer>
      <button class="btn" @click="emit('close')">取消</button>
      <button class="btn" @click="pick">换一张</button>
      <button class="btn primary" :disabled="!result" @click="apply">放到画布上</button>
    </template>
  </Modal>
</template>
