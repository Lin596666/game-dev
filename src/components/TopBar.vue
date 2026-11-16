<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '@/store/editor'

const store = useEditorStore()

const emit = defineEmits<{
  (e: 'new'): void
  (e: 'library'): void
  (e: 'projects'): void
  (e: 'import-image'): void
  (e: 'export-panel'): void
  (e: 'toggle-panel'): void
}>()

const saveText = computed(() => {
  if (store.dirty) return '未保存'
  if (!store.lastSavedAt) return '本地自动保存'
  const d = new Date(store.lastSavedAt)
  return `已保存 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="10" cy="10" r="6.5" fill="#E9A6AE" />
        <circle cx="22" cy="10" r="6.5" fill="#A8D8C4" />
        <circle cx="10" cy="22" r="6.5" fill="#F5D547" />
        <circle cx="22" cy="22" r="6.5" fill="#8FA98A" />
        <circle cx="10" cy="10" r="2" fill="#FBF7F1" />
        <circle cx="22" cy="10" r="2" fill="#FBF7F1" />
        <circle cx="10" cy="22" r="2" fill="#FBF7F1" />
        <circle cx="22" cy="22" r="2" fill="#FBF7F1" />
      </svg>
      <span>拼豆工房</span>
    </div>

    <div class="topbar-title">
      <input v-model="store.docName" class="title-input" maxlength="40" aria-label="图纸名称" />
      <span class="save-hint">{{ store.width }}×{{ store.height }} · {{ saveText }}</span>
    </div>

    <button class="btn icon ghost" title="撤销 Ctrl+Z" :disabled="!store.canUndo" @click="store.undo()">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12H8" />
      </svg>
    </button>
    <button class="btn icon ghost" title="重做 Ctrl+Shift+Z" :disabled="!store.canRedo" @click="store.redo()">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 14l5-5-5-5" />
        <path d="M20 9H10a6 6 0 0 0 0 12h6" />
      </svg>
    </button>

    <button class="btn sm" @click="emit('new')">新建</button>
    <button class="btn sm" @click="emit('library')">图纸库</button>
    <button class="btn sm" @click="emit('projects')">我的作品</button>
    <button class="btn sm" @click="emit('import-image')">导入图片</button>
    <button class="btn sm primary" @click="emit('export-panel')">导出</button>

    <button class="btn icon ghost mobile-only" title="面板" @click="emit('toggle-panel')">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  </header>
</template>
