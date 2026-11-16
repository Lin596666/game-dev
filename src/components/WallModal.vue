<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ProjectSummary } from '@/storage/db'
import { IRON_FINISHES } from '@/core/iron'
import { useEditorStore } from '@/store/editor'
import Modal from './Modal.vue'

/**
 * 作品墙：把存下来的成品像拼豆装裱板一样挂在一面墙上。
 * 收藏的作品用木框装裱、放大一号；其余用纸胶带随手一贴。
 */
const store = useEditorStore()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open', id: string): void
}>()

const list = ref<ProjectSummary[]>([])
const loading = ref(true)
const tab = ref<'all' | 'starred'>('all')

const shown = computed(() => {
  const rows = tab.value === 'starred' ? list.value.filter((p) => p.starred) : list.value
  return [...rows].sort((a, b) => {
    if (!!a.starred !== !!b.starred) return a.starred ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
})

const totalBeads = computed(() => list.value.reduce((n, p) => n + (p.beads ?? 0), 0))
const starredCount = computed(() => list.value.filter((p) => p.starred).length)

function finishName(id?: string): string {
  if (!id) return ''
  const f = IRON_FINISHES.find((x) => x.id === id)
  return f && f.id !== 'raw' ? f.name : '未烫'
}

/** 每张作品给一个固定的微小倾角，看着像手工贴上去的，但不会每次刷新都跳 */
function tilt(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const step = (Math.abs(h) % 7) - 3
  return step * 1.1
}

async function refresh(): Promise<void> {
  loading.value = true
  list.value = await store.listAll()
  loading.value = false
}

onMounted(refresh)
</script>

<template>
  <Modal title="作品墙" wide @close="emit('close')">
    <div class="wall-top">
      <div class="lib-tabs">
        <button class="chip-tab" :class="{ on: tab === 'all' }" @click="tab = 'all'">全部 {{ list.length }}</button>
        <button class="chip-tab" :class="{ on: tab === 'starred' }" @click="tab = 'starred'">
          装裱 {{ starredCount }}
        </button>
      </div>
      <p class="hint wall-sum">
        一共 {{ totalBeads }} 颗豆子 ·
        {{ starredCount ? '装裱的是收藏的作品' : '点作品册里的 ☆ 就能装裱到这里' }}
      </p>
    </div>

    <div v-if="loading" class="empty">正在把作品挂上去…</div>
    <div v-else-if="!list.length" class="empty">墙上还空着，先画一张再去作品册里收藏它</div>
    <div v-else-if="!shown.length" class="empty">还没有装裱的作品</div>
    <div v-else class="wall">
      <div
        v-for="p in shown"
        :key="p.id"
        class="piece"
        :class="{ framed: p.starred }"
        :style="{ transform: `rotate(${tilt(p.id)}deg)` }"
        role="button"
        tabindex="0"
        @click="emit('open', p.id)"
        @keydown.enter="emit('open', p.id)"
      >
        <span class="tape" aria-hidden="true"></span>
        <div class="piece-art">
          <img v-if="p.thumb" :src="p.thumb" alt="" />
          <span v-else class="hint">空白</span>
        </div>
        <div class="piece-label">
          <strong>{{ p.name }}</strong>
          <span>{{ p.width }}×{{ p.height }} · {{ p.beads ?? 0 }} 颗</span>
          <span class="piece-finish">{{ finishName(p.finish) }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn" @click="emit('close')">关闭</button>
    </template>
  </Modal>
</template>
