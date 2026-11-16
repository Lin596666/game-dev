<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useEditorStore } from '@/store/editor'
import { colorById } from '@/core/colors'
import { planPrint, type PrintPage } from '@/core/print'
import Modal from './Modal.vue'

const store = useEditorStore()
const emit = defineEmits<{ (e: 'close'): void }>()

const cellMm = ref(6)
const showCodes = ref(true)

const plan = computed(() => planPrint(store.width, store.height, { cellMm: cellMm.value }))

interface Cell {
  x: number
  y: number
  hex: string
  code: string
}

interface PageView extends PrintPage {
  cells: Cell[]
}

/** 每页要画的格子，预先算好，模板里就不再调函数了 */
const pages = computed<PageView[]>(() => {
  const g = store.grid
  return plan.value.pages.map((p) => {
    const cells: Cell[] = []
    for (let y = p.y; y < p.y + p.rows; y++) {
      for (let x = p.x; x < p.x + p.cols; x++) {
        const id = g.get(x, y)
        const c = id ? colorById(id) : null
        cells.push({ x, y, hex: c ? c.hex : '#FFFFFF', code: c ? c.code : '' })
      }
    }
    return { ...p, cells }
  })
})

const cellWidth = computed(() => `${cellMm.value}mm`)

function doPrint(): void {
  window.print()
}

onMounted(() => {
  document.body.classList.add('printing')
})

// 组件卸载时清掉，避免正常浏览也被打印样式影响
onBeforeUnmount(() => {
  document.body.classList.remove('printing')
})
</script>

<template>
  <Modal title="打印图纸" wide @close="emit('close')">
    <div class="print-bar">
      <label class="print-field">
        <span>每格</span>
        <select v-model.number="cellMm">
          <option :value="4">4mm（省纸）</option>
          <option :value="5">5mm（和真豆一样大）</option>
          <option :value="6">6mm（好数格子）</option>
          <option :value="8">8mm（大图更清楚）</option>
        </select>
      </label>
      <label class="print-check">
        <input v-model="showCodes" type="checkbox" />
        <span>标色号</span>
      </label>
      <span class="print-meta">
        共 {{ plan.pages.length }} 页 · 每页 {{ plan.cols }}×{{ plan.rows }} 格 ·
        按 A4 纵向排版
      </span>
      <button class="btn primary" @click="doPrint">打印 / 存为 PDF</button>
    </div>

    <p class="print-tip">
      打印对话框里把「页边距」选为「默认」、关掉「页眉页脚」，出图就和下面预览一致。
      多页图纸按「列→行」顺序排列，拼在一起就是完整的图。
    </p>

    <div class="print-preview">
      <div v-for="page in pages" :key="page.index" class="print-sheet">
        <div class="sheet-head">
          <span class="sheet-name">{{ store.docName }}</span>
          <span class="sheet-pos">
            第 {{ page.index + 1 }} / {{ pages.length }} 页 ·
            行 {{ page.y + 1 }}–{{ page.y + page.rows }} · 列 {{ page.x + 1 }}–{{ page.x + page.cols }}
          </span>
        </div>
        <div
          class="sheet-grid"
          :style="{ gridTemplateColumns: `repeat(${page.cols}, ${cellWidth})` }"
        >
          <div
            v-for="cell in page.cells"
            :key="`${cell.x}-${cell.y}`"
            class="sheet-cell"
            :class="{ 'edge-ten': (cell.x + 1) % 10 === 0 || (cell.y + 1) % 10 === 0 }"
            :style="{ background: cell.hex }"
          >
            <span v-if="showCodes && cell.code" class="cell-code">{{ cell.code }}</span>
          </div>
        </div>
      </div>
    </div>
  </Modal>

  <!-- 真正送去打印的版本：只有白纸、格子和标注，不带界面 -->
  <Teleport to="body">
    <div class="print-root">
      <section v-for="page in pages" :key="page.index" class="print-page">
        <header class="print-head">
          <strong>{{ store.docName }}</strong>
          <span>
            第 {{ page.index + 1 }} / {{ pages.length }} 页 ·
            行 {{ page.y + 1 }}–{{ page.y + page.rows }} · 列 {{ page.x + 1 }}–{{ page.x + page.cols }}
          </span>
        </header>
        <div class="print-grid" :style="{ gridTemplateColumns: `repeat(${page.cols}, 1fr)` }">
          <div
            v-for="cell in page.cells"
            :key="`${cell.x}-${cell.y}`"
            class="print-cell"
            :style="{ background: cell.hex }"
          >
            <span v-if="showCodes && cell.code" class="print-code">{{ cell.code }}</span>
          </div>
        </div>
        <footer class="print-foot">拼豆工房 · 每格 {{ cellMm }}mm · 色号为屏幕近似值，下单请对照实际色卡</footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.print-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding-bottom: 10px;
}

.print-field,
.print-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--ink-2);
}

.print-field select {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 10px;
  padding: 6px 8px;
  font-size: 13px;
  color: var(--ink);
}

.print-meta {
  font-size: 12px;
  color: var(--ink-3);
}

.print-tip {
  font-size: 12px;
  color: var(--ink-3);
  line-height: 1.7;
  margin: 4px 0 14px;
}

.print-preview {
  max-height: 52vh;
  overflow: auto;
  padding: 4px;
}

.print-sheet {
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: 0 6px 18px rgba(58, 52, 46, 0.06);
  padding: 12px;
  margin-bottom: 18px;
}

.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  color: var(--ink-2);
  margin-bottom: 8px;
}

.sheet-name {
  font-weight: 600;
  color: var(--ink);
}

.sheet-grid {
  display: grid;
  justify-content: center;
}

.sheet-cell {
  width: v-bind(cellWidth);
  height: v-bind(cellWidth);
  box-sizing: border-box;
  border: 0.5px solid rgba(58, 52, 46, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.sheet-cell.edge-ten {
  border-right-width: 1px;
  border-bottom-width: 1px;
  border-color: rgba(58, 52, 46, 0.4);
}

.cell-code {
  font-size: 8px;
  line-height: 1;
  color: rgba(58, 52, 46, 0.72);
}
</style>

<style>
/* 打印样式必须是全局的：只留 print-root，其余全部不显示 */
.print-root {
  display: none;
}

@media print {
  body.printing .app {
    display: none !important;
  }
  body.printing .print-root {
    display: block !important;
  }
  body.printing .print-root .print-page {
    page-break-after: always;
    break-after: page;
  }
  body.printing .print-root .print-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  @page {
    size: A4 portrait;
    margin: 10mm;
  }
  .print-head {
    display: flex;
    justify-content: space-between;
    font-size: 10pt;
    margin-bottom: 4mm;
  }
  .print-grid {
    display: grid;
    justify-content: center;
    border: 0.4pt solid #333;
  }
  .print-cell {
    box-sizing: border-box;
    aspect-ratio: 1 / 1;
    border: 0.25pt solid rgba(0, 0, 0, 0.18);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .print-code {
    font-size: 5pt;
    color: rgba(0, 0, 0, 0.7);
  }
  .print-foot {
    margin-top: 4mm;
    font-size: 8pt;
    color: #666;
  }
}
</style>
