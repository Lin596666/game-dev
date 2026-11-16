<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { loadProject, type ProjectSummary } from '@/storage/db'
import { parseProjectFile } from '@/core/project'
import { canvasToBlob, downloadBlob, renderShareCard } from '@/renderer/export'
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
const sizeFilter = ref<'all' | 'small' | 'medium' | 'large'>('all')
const finishFilter = ref<'all' | string>('all')
const busyId = ref('')
const msg = ref('')

const SIZE_BANDS = [
  { id: 'all', label: '全部尺寸' },
  { id: 'small', label: '一小板以内' },
  { id: 'medium', label: '1~2 板' },
  { id: 'large', label: '两板以上' }
] as const

function inSizeBand(p: ProjectSummary): boolean {
  const band = sizeFilter.value
  if (band === 'all') return true
  const long = Math.max(p.width, p.height)
  if (band === 'small') return long <= 29
  if (band === 'medium') return long > 29 && long <= 58
  return long > 58
}

const shown = computed(() => {
  let rows = tab.value === 'starred' ? list.value.filter((p) => p.starred) : list.value
  rows = rows.filter((p) => inSizeBand(p))
  if (finishFilter.value !== 'all') {
    rows = rows.filter((p) => (p.finish ?? 'raw') === finishFilter.value)
  }
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

/** 单张作品直接出一张 1080×1350 分享卡，省得先打开再导出 */
async function cardFor(p: ProjectSummary): Promise<void> {
  if (busyId.value) return
  busyId.value = p.id
  msg.value = ''
  try {
    const rec = await loadProject(p.id)
    if (!rec) throw new Error('找不到这张作品')
    const parsed = parseProjectFile(JSON.parse(rec.payload))
    const { canvas } = renderShareCard(parsed.grid, {
      name: p.name,
      beads: p.beads ?? parsed.grid.usedCount(),
      width: parsed.grid.width,
      height: parsed.grid.height,
      finishName: p.finish && p.finish !== 'raw' ? finishName(p.finish) : ''
    })
    const blob = await canvasToBlob(canvas)
    downloadBlob(blob, p.name + '-分享卡.png')
    msg.value = '分享卡已下载：' + p.name
  } catch (err) {
    msg.value = err instanceof Error ? err.message : '生成分享卡失败'
  } finally {
    busyId.value = ''
  }
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

    <div class="wall-filters">
      <button
        v-for="b in SIZE_BANDS"
        :key="b.id"
        class="chip-tab"
        :class="{ on: sizeFilter === b.id }"
        @click="sizeFilter = b.id"
      >
        {{ b.label }}
      </button>
      <select v-model="finishFilter" class="mini-select" title="按烫法筛选">
        <option value="all">全部烫法</option>
        <option v-for="f in IRON_FINISHES" :key="f.id" :value="f.id">{{ f.name }}</option>
      </select>
    </div>
    <p v-if="msg" class="hint wall-msg">{{ msg }}</p>

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
        <button class="piece-share" :disabled="busyId === p.id" @click.stop="cardFor(p)">
          {{ busyId === p.id ? '生成中' : '存分享卡' }}
        </button>
      </div>
    </div>

    <template #footer>
      <button class="btn" @click="emit('close')">关闭</button>
    </template>
  </Modal>
</template>
