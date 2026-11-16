<script setup lang="ts">
import { computed, ref } from 'vue'
import { COLOR_SETS, groupedColors, type ColorSetId } from '@/core/colors'
import { useEditorStore, type Symmetry } from '@/store/editor'

const store = useEditorStore()

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
      </div>

      <div class="panel-section">
        <div class="panel-head">
          <span class="panel-title">整理</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px">
          <button class="btn sm" @click="store.transform('flipX')">左右翻转</button>
          <button class="btn sm" @click="store.transform('flipY')">上下翻转</button>
          <button class="btn sm" @click="store.transform('rotate180')">旋转 180°</button>
          <button class="btn sm" @click="store.trim()">裁掉空白</button>
          <button class="btn sm danger" @click="store.clearAll()">清空画布</button>
        </div>
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
