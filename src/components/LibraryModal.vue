<script setup lang="ts">
import { LIBRARY } from '@/core/library'
import { colorUsage } from '@/core/pattern'
import { renderThumbnail } from '@/renderer/export'
import Modal from './Modal.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'pick', id: string): void
}>()

const items = LIBRARY.map((p) => {
  const g = p.build()
  return {
    id: p.id,
    name: p.name,
    desc: p.desc,
    size: p.size,
    beads: g.usedCount(),
    colors: colorUsage(g).length,
    thumb: renderThumbnail(g, 120)
  }
})
</script>

<template>
  <Modal title="图纸库" wide @close="emit('close')">
    <p class="hint" style="margin: 0 0 12px">
      挑一张现成的图纸开始跟拼。打开后原图会填进画布，可以继续改颜色、加装饰，也可以直接导出打印。
    </p>
    <div class="lib-grid">
      <button v-for="it in items" :key="it.id" class="lib-card" @click="emit('pick', it.id)">
        <div
          style="
            height: 110px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fbf7f1;
            border-radius: 10px;
            margin-bottom: 8px;
          "
        >
          <img :src="it.thumb" alt="" style="max-height: 100%; image-rendering: pixelated" />
        </div>
        <div class="n">{{ it.name }}</div>
        <div class="d">{{ it.size }}×{{ it.size }} · {{ it.beads }} 颗 · {{ it.colors }} 色</div>
        <div class="d">{{ it.desc }}</div>
      </button>
    </div>
    <template #footer>
      <button class="btn" @click="emit('close')">关闭</button>
    </template>
  </Modal>
</template>
