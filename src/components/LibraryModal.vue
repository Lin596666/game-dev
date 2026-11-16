<script setup lang="ts">
import { computed, ref } from 'vue'
import { LIBRARY } from '@/core/library'
import { colorUsage } from '@/core/pattern'
import { renderThumbnail } from '@/renderer/export'
import Modal from './Modal.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'pick', id: string): void
}>()

const FAV_KEY = 'bead:libfav'

function loadFav(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    const arr: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

const fav = ref<string[]>(loadFav())
const tab = ref<'all' | 'fav'>('all')

function toggleFav(id: string): void {
  const next = fav.value.includes(id) ? fav.value.filter((x) => x !== id) : [...fav.value, id]
  fav.value = next
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式下写不进去就算了 */
  }
}

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

const shown = computed(() => (tab.value === 'fav' ? items.filter((it) => fav.value.includes(it.id)) : items))
</script>

<template>
  <Modal title="图纸库" wide @close="emit('close')">
    <p class="hint" style="margin: 0 0 12px">
      挑一张现成的图纸开始跟拼。打开后原图会填进画布，可以继续改颜色、加装饰，也可以直接导出打印。
    </p>
    <div class="lib-tabs">
      <button class="chip-tab" :class="{ on: tab === 'all' }" @click="tab = 'all'">全部 {{ items.length }}</button>
      <button class="chip-tab" :class="{ on: tab === 'fav' }" @click="tab = 'fav'">收藏 {{ fav.length }}</button>
    </div>
    <div v-if="!shown.length" class="empty">还没有收藏的图纸，点卡片右上角的 ☆ 收进来</div>
    <div v-else class="lib-grid">
      <div
        v-for="it in shown"
        :key="it.id"
        class="lib-card"
        role="button"
        tabindex="0"
        @click="emit('pick', it.id)"
        @keydown.enter="emit('pick', it.id)"
      >
        <button
          class="lib-star"
          :class="{ on: fav.includes(it.id) }"
          :title="fav.includes(it.id) ? '取消收藏' : '收藏这张图纸'"
          @click.stop="toggleFav(it.id)"
        >
          {{ fav.includes(it.id) ? '★' : '☆' }}
        </button>
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
      </div>
    </div>
    <template #footer>
      <button class="btn" @click="emit('close')">关闭</button>
    </template>
  </Modal>
</template>
