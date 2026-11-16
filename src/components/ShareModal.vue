<script setup lang="ts">
import { computed, ref } from 'vue'
import { BeadGrid } from '@/core/grid'
import { decodeShare, encodeShare, shareUrl } from '@/core/share'
import { useEditorStore } from '@/store/editor'
import Modal from './Modal.vue'

const store = useEditorStore()

const emit = defineEmits<{ (e: 'close'): void }>()

const message = ref('')
const pasteText = ref('')

const code = computed(() =>
  encodeShare({
    name: store.docName,
    width: store.width,
    height: store.height,
    cells: store.grid.data
  })
)

const link = computed(() => shareUrl(code.value))

const sizeText = computed(() => {
  const n = code.value.length
  return n < 1000 ? `${n} 个字符` : `${(n / 1000).toFixed(1)}k 个字符`
})

async function copy(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    message.value = `${label}已复制`
    return
  } catch {
    /* 没有剪贴板权限就退回手动选中 */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    message.value = ok ? `${label}已复制` : '复制失败，手动选中下面的文字吧'
  } catch {
    message.value = '复制失败，手动选中下面的文字吧'
  }
}

function importCode(): void {
  const text = pasteText.value.trim()
  if (!text) {
    message.value = '先粘贴一段分享码'
    return
  }
  try {
    const payload = decodeShare(text)
    if (store.total > 0) {
      // 覆盖前先让自动保存把当前这张存好，免得聊天时弄丢
      void store.persist()
    }
    const grid = new BeadGrid(payload.width, payload.height, payload.cells)
    store.docName = '来自分享的图纸'
    store.loadGrid(grid, { newId: true, keepName: true })
    message.value = `已导入 ${payload.width}×${payload.height} 图纸`
    pasteText.value = ''
    setTimeout(() => emit('close'), 500)
  } catch (err) {
    message.value = err instanceof Error ? err.message : '分享码解析失败'
  }
}
</script>

<template>
  <Modal title="分享图纸" @close="emit('close')">
    <p class="hint" style="margin-top: 0">
      分享码把整张图纸压成一串字符，不经过任何服务器。对方打开链接、或把码粘到下面的输入框，就能得到同一张图纸。
    </p>

    <div class="field">
      <label>图纸链接（{{ sizeText }}）</label>
      <div class="share-row">
        <input class="share-input" :value="link" readonly @focus="($event.target as HTMLInputElement).select()" />
        <button class="btn sm" @click="copy(link, '链接')">复制链接</button>
      </div>
    </div>

    <div class="field">
      <label>分享码</label>
      <div class="share-row">
        <input class="share-input" :value="code" readonly @focus="($event.target as HTMLInputElement).select()" />
        <button class="btn sm" @click="copy(code, '分享码')">复制分享码</button>
      </div>
    </div>

    <div class="field">
      <label>粘贴朋友的分享码</label>
      <div class="share-row">
        <input v-model="pasteText" class="share-input" placeholder="粘贴 b1.… 开头的分享码" />
        <button class="btn sm primary" @click="importCode">导入</button>
      </div>
    </div>

    <p v-if="message" class="hint" style="color: var(--ink)">{{ message }}</p>

    <template #footer>
      <button class="btn" @click="emit('close')">关闭</button>
    </template>
  </Modal>
</template>
