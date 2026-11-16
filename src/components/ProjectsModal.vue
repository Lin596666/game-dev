<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { ProjectSummary } from '@/storage/db'
import { IRON_FINISHES } from '@/core/iron'
import { useEditorStore } from '@/store/editor'
import Modal from './Modal.vue'

const store = useEditorStore()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open', id: string): void
}>()

const list = ref<ProjectSummary[]>([])
const loading = ref(true)
const fileInput = ref<HTMLInputElement | null>(null)
const editing = ref<string | null>(null)
const editName = ref('')

function startRename(p: ProjectSummary): void {
  editing.value = p.id
  editName.value = p.name
}

async function saveName(id: string): Promise<void> {
  await store.renameProject(id, editName.value)
  editing.value = null
  await refresh()
}

async function duplicate(id: string): Promise<void> {
  await store.duplicateProject(id)
  await refresh()
}

function finishName(id?: string): string {
  if (!id) return ''
  const f = IRON_FINISHES.find((x) => x.id === id)
  return f && f.id !== 'raw' ? f.name : ''
}

function fmt(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function refresh(): Promise<void> {
  loading.value = true
  list.value = await store.listAll()
  loading.value = false
}

onMounted(refresh)

async function remove(id: string): Promise<void> {
  if (!window.confirm('删除这张图纸？删除后无法恢复，建议先导出工程文件备份。')) return
  await store.removeProject(id)
  await refresh()
}

function pickFile(): void {
  fileInput.value?.click()
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    store.importJson(text)
    emit('close')
  } catch (err) {
    window.alert(`导入失败：${err instanceof Error ? err.message : String(err)}`)
  }
}
</script>

<template>
  <Modal title="我的作品" wide @close="emit('close')">
    <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap">
      <button class="btn sm" @click="pickFile">从工程文件导入</button>
      <button class="btn sm" @click="refresh">刷新</button>
      <span class="hint" style="align-self: center">
        作品自动保存在本机浏览器里；换设备请用「导出工程文件」带走
      </span>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFile" />
    </div>

    <div v-if="loading" class="empty">正在读取本地作品…</div>
    <div v-else-if="!list.length" class="empty">还没有保存的作品，画点什么就会自动存下来</div>
    <div v-else class="project-grid">
      <div v-for="p in list" :key="p.id" class="project-card">
        <div class="thumb" @click="emit('open', p.id)">
          <img v-if="p.thumb" :src="p.thumb" alt="" />
          <span v-else class="hint">空白</span>
        </div>
        <div class="info">
          <div v-if="editing === p.id" class="row-inline" style="margin-bottom: 4px">
            <input v-model="editName" class="mini-input" style="width: auto; flex: 1; text-align: left" />
            <button class="btn sm" @click="saveName(p.id)">好</button>
          </div>
          <div v-else class="n">{{ p.name }}</div>
          <div class="d">{{ p.width }}×{{ p.height }}{{ p.beads ? ' · ' + p.beads + ' 颗' : '' }} · {{ fmt(p.updatedAt) }}</div>
          <div v-if="finishName(p.finish)" class="d">{{ finishName(p.finish) }}</div>
          <div style="display: flex; gap: 6px; margin-top: 6px">
            <button class="btn sm" @click="emit('open', p.id)">打开</button>
            <button class="btn sm" @click="startRename(p)">改名</button>
            <button class="btn sm" @click="duplicate(p.id)">复制</button>
            <button class="btn sm danger" @click="remove(p.id)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn" @click="emit('close')">关闭</button>
    </template>
  </Modal>
</template>
