<script setup lang="ts">
import { computed, ref } from 'vue'
import { COLOR_SETS, groupedColors, type ColorSetId } from '@/core/colors'
import { useEditorStore, type Symmetry } from '@/store/editor'

const store = useEditorStore()

const emit = defineEmits<{ (e: 'stock'): void }>()

const tab = ref<'color' | 'canvas' | 'guide'>('color')
const activeSet = ref<ColorSetId>('basic')

const groups = groupedColors()
const swatches = computed(() => groups.find((g) => g.set.id === activeSet.value)?.colors ?? [])

const symmetries: Array<{ id: Symmetry; label: string }> = [
  { id: 'none', label: '无' },
  { id: 'x', label: '左右' },
  { id: 'y', label: '上下' },
  { id: 'quad', label: '四向' }
]

const guideOptions = computed(() => [
  { value: 0, label: '全部未完成的格子' },
  ...store.usage.map((u) => ({ value: u.id, label: `${u.color.code} ${u.color.name}（${u.count}）` }))
])

function onGuideColor(e: Event): void {
  const v = Number((e.target as HTMLSelectElement).value)
  store.guideColorId = v === 0 ? null : v
}

const pct = computed(() => Math.round(store.progress * 100))

// 换色卡：把整张图纸的配色吸附到用户实际买的那套豆子上
const fitSet = ref<ColorSetId>('morandi')
const fitMsg = ref('')

function applyFit(): void {
  const res = store.fitPalette(fitSet.value)
  if (res.changed === 0) {
    fitMsg.value = '这张图纸已经在用这套色卡了，不用换。'
  } else {
    fitMsg.value = `换了 ${res.changed} 颗，现在一共 ${res.colorsAfter} 种颜色。`
  }
}
</script>

<template>
  <aside class="side-panel">
    <div class="panel-section" style="padding-bottom: 8px">
      <div class="seg" style="width: 100%">
        <button :class="{ on: tab === 'color' }" style="flex: 1" @click="tab = 'color'">颜色</button>
        <button :class="{ on: tab === 'canvas' }" style="flex: 1" @click="tab = 'canvas'">图纸</button>
        <button :class="{ on: tab === 'guide' }" style="flex: 1" @click="tab = 'guide'">跟拼</button>
      </div>
    </div>

    <!-- 颜色 -->
    <template v-if="tab === 'color'">
      <div class="panel-section">
        <div class="current-color">
          <span class="dot" :style="{ background: store.currentColor?.hex ?? '#fff' }" />
          <div class="meta">
            <div class="name">{{ store.currentColor?.name ?? '未选择' }}</div>
            <div class="code">{{ store.currentColor?.code ?? '—' }} · {{ store.currentColor?.hex }}</div>
          </div>
        </div>
        <div class="seg" style="flex-wrap: wrap">
          <button
            v-for="s in COLOR_SETS"
            :key="s.id"
            :class="{ on: activeSet === s.id }"
            @click="activeSet = s.id"
          >
            {{ s.label }}
          </button>
        </div>
        <p class="hint" style="margin: 8px 0 10px">
          {{ groups.find((g) => g.set.id === activeSet)?.set.desc }}
        </p>
        <div class="swatch-grid">
          <button
            v-for="c in swatches"
            :key="c.id"
            class="swatch"
            :class="{ on: store.colorId === c.id }"
            :style="{ background: c.hex }"
            :title="`${c.code} ${c.name}`"
            @click="store.colorId = c.id"
          />
        </div>
      </div>
    </template>

    <!-- 图纸 -->
    <template v-else-if="tab === 'canvas'">
      <div class="panel-section">
        <div class="panel-head">
          <span class="panel-title">笔刷</span>
          <span class="panel-sub">{{ store.brushSize }} 格</span>
        </div>
        <div class="seg">
          <button
            v-for="n in [1, 2, 3, 4]"
            :key="n"
            :class="{ on: store.brushSize === n }"
            @click="store.brushSize = n"
          >
            {{ n }}
          </button>
        </div>

        <div class="panel-head" style="margin-top: 14px">
          <span class="panel-title">对称</span>
          <span class="panel-sub">画一半，另一半自动补</span>
        </div>
        <div class="seg">
          <button
            v-for="s in symmetries"
            :key="s.id"
            :class="{ on: store.symmetry === s.id }"
            @click="store.symmetry = s.id"
          >
            {{ s.label }}
          </button>
        </div>

        <div class="panel-head" style="margin-top: 14px">
          <span class="panel-title">显示</span>
        </div>
        <div class="seg" style="margin-bottom: 8px">
          <button :class="{ on: store.style === 'bead' }" @click="store.style = 'bead'">珠子</button>
          <button :class="{ on: store.style === 'flat' }" @click="store.style = 'flat'">平铺</button>
          <button :class="{ on: store.style === 'chart' }" @click="store.style = 'chart'">图纸</button>
        </div>
        <label class="usage-item" style="cursor: pointer" @click.prevent="store.showGrid = !store.showGrid">
          <input type="checkbox" :checked="store.showGrid" />
          显示网格线
        </label>
        <label class="usage-item" style="cursor: pointer" @click.prevent="store.showNumbers = !store.showNumbers">
          <input type="checkbox" :checked="store.showNumbers" />
          显示色号（放大后可见）
        </label>
        <label class="usage-item" style="cursor: pointer" @click.prevent="store.setSoundOn(!store.soundOn)">
          <input type="checkbox" :checked="store.soundOn" />
          珠子落盘的声音
        </label>
      </div>

      <div class="panel-section">
        <div class="panel-head">
          <span class="panel-title">整理</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px">
          <button class="btn sm" @click="store.transform('flipX')">左右翻转</button>
          <button class="btn sm" @click="store.transform('flipY')">上下翻转</button>
          <button class="btn sm" @click="store.transform('rotate180')">旋转 180°</button>
          <button class="btn sm" @click="store.rotate90()">旋转 90°</button>
          <button class="btn sm" @click="store.trim()">裁掉空白</button>
          <button class="btn sm danger" @click="store.clearAll()">清空画布</button>
        </div>
        <p class="hint" style="margin: 8px 0 0">旋转 90° 会交换宽高，跟拼进度会跟着重置。</p>
      </div>

      <div class="panel-section">
        <div class="panel-head">
          <span class="panel-title">成品尺寸</span>
          <span class="panel-sub">5mm 豆</span>
        </div>
        <div class="stat-row">
          <span>成品约</span>
          <b>{{ store.physical.widthCm }} × {{ store.physical.heightCm }} cm</b>
        </div>
        <div class="stat-row">
          <span>需要豆板</span>
          <b>{{ store.physical.boards }} 块（29×29）</b>
        </div>
        <div class="stat-row">
          <span>A4 打印</span>
          <b>{{ store.physical.pages }} 页</b>
        </div>
        <p class="hint" style="margin: 8px 0 0">
          每页 {{ store.physical.cols }} × {{ store.physical.rows }} 格，按 6mm 一格排版；豆板数按 29×29 标准板估算。
        </p>
      </div>

      <div class="panel-section">
        <div class="panel-head">
          <span class="panel-title">换成我的色卡</span>
        </div>
        <select class="select" v-model="fitSet">
          <option v-for="s in COLOR_SETS" :key="s.id" :value="s.id">{{ s.label }} · {{ s.desc }}</option>
        </select>
        <div style="margin-top: 10px">
          <button class="btn sm" @click="applyFit">吸附到这套色卡</button>
        </div>
        <p class="hint" style="margin: 8px 0 0">
          {{ fitMsg || '把整张图纸用到的颜色统一换算成这套色卡里最接近的豆子色，同一种原色永远换成同一种新色。' }}
        </p>
      </div>

      <div class="panel-section grow">
        <div class="panel-head">
          <span class="panel-title">用量</span>
          <span class="panel-sub">{{ store.usage.length }} 色</span>
        </div>
        <div class="stat-row">
          <span>豆子总数</span><b>{{ store.total }} 颗</b>
        </div>
        <div class="stat-row">
          <span>约需时长</span><b>{{ Math.max(1, Math.round(store.total / 40)) }} 分钟</b>
        </div>
        <div class="stat-row">
          <span>材料估价</span><b>¥ {{ store.cost.toFixed(2) }}</b>
        </div>
        <div class="stat-row" style="cursor: pointer" @click="emit('stock')">
          <span>还缺豆子</span>
          <b :class="{ 'short-warn': store.stockInfo.totalShort > 0 }">
            {{ store.stockInfo.totalShort > 0 ? `${store.stockInfo.totalShort} 颗` : '够用' }}
          </b>
        </div>
        <button class="btn sm" style="width: 100%; margin-top: 8px" @click="emit('stock')">
          库存 · 采购清单
        </button>
        <div class="usage-list" style="margin-top: 8px">
          <div
            v-for="u in store.usage"
            :key="u.id"
            class="usage-item"
            @click="store.colorId = u.id"
          >
            <span class="dot" :style="{ background: u.color.hex }" />
            <span class="code">{{ u.color.code }}</span>
            <span class="name">{{ u.color.name }}</span>
            <span class="count">{{ u.count }}</span>
          </div>
          <div v-if="!store.usage.length" class="empty" style="padding: 20px 0">
            还是空白图纸，先在左边选个颜色开始吧
          </div>
        </div>
      </div>
    </template>

    <!-- 跟拼 -->
    <template v-else>
      <div class="panel-section">
        <div class="panel-head">
          <span class="panel-title">跟图纸拼</span>
          <span class="panel-sub">{{ pct }}%</span>
        </div>
        <div class="progress-bar"><i :style="{ width: pct + '%' }" /></div>
        <div class="stat-row">
          <span>已完成</span><b>{{ store.doneCount }} / {{ store.total }} 颗</b>
        </div>
        <div class="stat-row">
          <span>这次拼了</span>
          <b>{{ store.sessionMinutes }} 分钟</b>
        </div>
        <label class="usage-item" style="cursor: pointer; margin-top: 6px" @click.prevent="store.guideMode = !store.guideMode">
          <input type="checkbox" :checked="store.guideMode" />
          开启跟拼模式
        </label>
        <p class="hint" style="margin: 4px 0 0">
          开启后画布上会高亮「还没拼」的格子，点一下就算放好一颗；再点一下取消。适合照着图纸慢慢拼。
        </p>
      </div>

      <div class="panel-section">
        <div class="panel-head">
          <span class="panel-title">分步引导</span>
          <span class="panel-sub">一颗一颗来</span>
        </div>
        <label class="usage-item" style="cursor: pointer" @click.prevent="store.guideStepMode = !store.guideStepMode">
          <input type="checkbox" :checked="store.guideStepMode" />
          开启分步引导
        </label>
        <template v-if="store.guideStepMode">
          <div class="stat-row" style="margin-top: 6px">
            <span>还剩</span><b>{{ store.guideRemaining }} 颗没拼</b>
          </div>
          <div class="stat-row">
            <span>光标位置</span>
            <b v-if="store.guideFocus">第 {{ store.guideFocus.y + 1 }} 行 · 第 {{ store.guideFocus.x + 1 }} 列</b>
            <b v-else>全部拼完啦 🎉</b>
          </div>
          <div style="margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap">
            <button class="btn sm" :disabled="store.guideRemaining === 0" @click="store.prevStep()">上一颗</button>
            <button class="btn sm" :disabled="store.guideRemaining === 0" @click="store.nextStep()">下一颗</button>
            <button class="btn sm" :disabled="store.guideRemaining === 0" @click="store.resetStep()">回到开头</button>
          </div>
          <p class="hint" style="margin: 8px 0 0">
            光标会一直停在「下一颗没拼的格子」上，点一下画布就算拼好，光标自动往前走。跳着拼也不会错位。
          </p>
        </template>
        <p v-else class="hint" style="margin: 6px 0 0">
          开启后画布上会出现一个圈，指着"下一颗该拼的豆子"，适合完全没拼过的新手。
        </p>
      </div>

      <div class="panel-section">
        <div class="panel-head">
          <span class="panel-title">高亮范围</span>
        </div>
        <select class="select" :value="store.guideColorId ?? 0" @change="onGuideColor">
          <option v-for="o in guideOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <div style="margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap">
          <button
            class="btn sm"
            :disabled="!store.guideColorId"
            @click="store.guideColorId && store.markColorDone(store.guideColorId)"
          >
            整色标记完成
          </button>
          <button class="btn sm" @click="store.clearDone()">重置进度</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-head">
          <span class="panel-title">跟拼小技巧</span>
        </div>
        <p class="hint" style="margin: 0">
          1. 放大到 800% 以上，珠子的孔和高光会显示出来，更容易数格子。<br />
          2. 先拼大色块，再用「按颜色高亮」一个个收尾。<br />
          3. 拼完记得导出图纸存档，换设备也能继续。
        </p>
      </div>
    </template>
  </aside>
</template>
