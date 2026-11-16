<script setup lang="ts">
import { ref } from 'vue'
import Modal from './Modal.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'create', payload: { name: string; width: number; height: number }): void
}>()

interface Preset {
  label: string
  size: number
  note: string
}

const presets: Preset[] = [
  { label: '小方板', size: 29, note: '杯垫 / 挂件' },
  { label: '中方板', size: 48, note: '最常用' },
  { label: '大方板', size: 58, note: '立牌 / 相框' },
  { label: '组合板', size: 72, note: '小幅挂画' },
  { label: '大幅', size: 96, note: '海报级' }
]

const name = ref('新图纸')
const width = ref(48)
const height = ref(48)

function choose(p: Preset): void {
  width.value = p.size
  height.value = p.size
}

function clamp(v: number): number {
  return Math.min(160, Math.max(8, Math.round(v) || 8))
}

function submit(): void {
  emit('create', { name: name.value, width: clamp(width.value), height: clamp(height.value) })
}
</script>

<template>
  <Modal title="新建图纸" @close="emit('close')">
    <div class="field">
      <label>图纸名称</label>
      <input v-model="name" class="input" maxlength="40" placeholder="给这张图纸起个名字" />
    </div>

    <div class="field">
      <label>选个尺寸</label>
      <div class="lib-grid">
        <button
          v-for="p in presets"
          :key="p.size"
          class="lib-card"
          :style="width === p.size && height === p.size ? 'border-color:#C97B5A' : ''"
          @click="choose(p)"
        >
          <div class="n">{{ p.label }}</div>
          <div class="d">{{ p.size }}×{{ p.size }} · {{ p.note }}</div>
        </button>
      </div>
    </div>

    <div style="display: flex; gap: 10px">
      <div class="field" style="flex: 1">
        <label>宽（格）</label>
        <input v-model.number="width" class="input" type="number" min="8" max="160" />
      </div>
      <div class="field" style="flex: 1">
        <label>高（格）</label>
        <input v-model.number="height" class="input" type="number" min="8" max="160" />
      </div>
    </div>

    <p class="hint">
      新建会替换当前画布（当前图纸已自动保存在「我的作品」里）。建议从 29×29 或 48×48 开始，珠子不会太多。
    </p>

    <template #footer>
      <button class="btn" @click="emit('close')">取消</button>
      <button class="btn primary" @click="submit">开始拼</button>
    </template>
  </Modal>
</template>
