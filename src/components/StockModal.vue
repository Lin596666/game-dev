<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditorStore } from '@/store/editor'
import { purchaseText } from '@/core/stock'
import { downloadText } from '@/renderer/export'
import Modal from './Modal.vue'

const store = useEditorStore()
const emit = defineEmits<{ (e: 'close'): void }>()

const copied = ref(false)
const bulkValue = ref('')
let copyTimer: ReturnType<typeof setTimeout> | null = null

const report = computed(() => store.stockInfo)
const current = computed(() => store.usage.find((u) => u.id === store.colorId)?.color ?? null)

function haveOf(id: number): number {
  return store.stock[id] ?? 0
}

function onHave(id: number, value: string): void {
  store.setStock(id, Number(value))
}

function fillAll(value: string): void {
  const n = Math.max(0, Math.floor(Number(value) || 0))
  for (const row of report.value.rows) store.setStock(row.id, n)
}

/** 一次买齐：每种颜色都在「还缺的颗数」上再留 10% 余量，碎豆/掉豆总得留点 */
function fillWithSpare(): void {
  for (const row of report.value.rows) {
    const want = row.need + Math.ceil(row.need * 0.1)
    store.setStock(row.id, want)
  }
}

async function copyList(): Promise<void> {
  const text = purchaseText(report.value, store.docName)
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = false), 1800)
  } catch {
    downloadText(text, `${store.docName}-采购清单.txt`)
  }
}

function download(): void {
  downloadText(purchaseText(report.value, store.docName), `${store.docName}-采购清单.txt`)
}
</script>

<template>
  <Modal title="豆子库存 · 采购清单" wide @close="emit('close')">
    <p class="stock-tip">
      填上你手上每种颜色有多少颗，下面会自动算出还缺多少。数据只存在这台设备上。
      不知道填多少就先点「按图纸一次买齐」，它会按需要量 +10% 余量记进库存。
    </p>

    <div class="stock-summary">
      <div class="stat">
        <span>需要</span><b>{{ report.totalNeed }} 颗</b>
      </div>
      <div class="stat">
        <span>缺</span>
        <b :class="{ warn: report.totalShort > 0 }">{{ report.totalShort }} 颗</b>
      </div>
      <div class="stat">
        <span>要补的颜色</span><b>{{ report.shortColors }} 种</b>
      </div>
      <div class="stock-actions">
        <input v-model="bulkValue" class="bulk-input" type="number" min="0" placeholder="例如 1000" />
        <button class="btn sm" @click="fillAll(bulkValue)">每种都填这个数</button>
        <button class="btn sm" @click="fillWithSpare">按图纸一次买齐</button>
      </div>
    </div>

    <div class="stock-table">
      <div class="stock-head">
        <span />
        <span>色号</span>
        <span>名字</span>
        <span class="num">需要</span>
        <span class="num">我有</span>
        <span class="num">还缺</span>
      </div>
      <div v-for="row in report.rows" :key="row.id" class="stock-row" @click="store.colorId = row.id">
        <span class="dot" :style="{ background: row.hex }" />
        <span class="code">{{ row.code }}</span>
        <span class="name">{{ row.name }}</span>
        <span class="num">{{ row.need }}</span>
        <input
          class="num-input"
          type="number"
          min="0"
          :value="haveOf(row.id) || ''"
          placeholder="0"
          @click.stop
          @change="onHave(row.id, ($event.target as HTMLInputElement).value)"
        />
        <span class="num" :class="{ warn: row.short > 0 }">{{ row.short > 0 ? row.short : '—' }}</span>
      </div>
      <div v-if="!report.rows.length" class="empty" style="padding: 24px 0">
        空白图纸，先画点什么吧
      </div>
    </div>

    <div class="stock-foot">
      <span v-if="current" class="hint">点任意一行会把当前颜色切到 {{ current.code }} {{ current.name }}</span>
      <span class="spacer" />
      <button class="btn sm" :disabled="!report.rows.length" @click="copyList">
        {{ copied ? '已复制 ✓' : '复制清单' }}
      </button>
      <button class="btn sm" :disabled="!report.rows.length" @click="download">下载清单 .txt</button>
    </div>
  </Modal>
</template>

<style scoped>
.stock-tip {
  font-size: 12px;
  color: var(--ink-3);
  line-height: 1.7;
  margin: 0 0 14px;
}

.stock-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
  padding: 12px 14px;
  background: var(--paper-2);
  border-radius: 14px;
  margin-bottom: 14px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--ink-3);
}

.stat b {
  font-size: 15px;
  color: var(--ink);
}

.warn {
  color: var(--clay);
}

.stock-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

.bulk-input {
  width: 96px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 6px 8px;
  font-size: 13px;
  background: #fff;
  color: var(--ink);
}

.stock-table {
  max-height: 46vh;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 14px;
}

.stock-head,
.stock-row {
  display: grid;
  grid-template-columns: 18px 54px 1fr 60px 78px 60px;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  font-size: 13px;
}

.stock-head {
  position: sticky;
  top: 0;
  background: var(--paper-2);
  color: var(--ink-3);
  font-size: 12px;
  z-index: 1;
}

.stock-row {
  border-top: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
}

.stock-row:hover {
  background: var(--paper-2);
}

.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(58, 52, 46, 0.12);
}

.code {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.num-input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 4px 6px;
  font-size: 13px;
  text-align: right;
  background: #fff;
  color: var(--ink);
}

.stock-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
}

.hint {
  font-size: 12px;
  color: var(--ink-3);
}

.spacer {
  flex: 1;
}
</style>
