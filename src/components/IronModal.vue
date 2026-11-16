<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { IRON_FINISHES } from '@/core/iron'
import { renderThumbnail } from '@/renderer/export'
import { playChime } from '@/core/sound'
import { useEditorStore } from '@/store/editor'
import Modal from './Modal.vue'

/**
 * 熨烫机：把"选烫法"做成一次真的动手流程。
 * 推托盘 → 机器预热 → 叮的一声 → 出成品，选好的烫法会作用到整张作品上。
 */
const store = useEditorStore()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

type Step = 'ready' | 'ironing' | 'done' | 'peeling' | 'peeled'

const step = ref<Step>('ready')
const progress = ref(0)
const flashes = ref(0)
const peelT = ref(0)
let timer: number | null = null
let peelTimer: number | null = null

const empty = computed(() => store.total === 0)
const preview = computed(() =>
  step.value === 'done' || step.value === 'peeled' ? renderThumbnail(store.grid, 360) : '',
)
const paperStyle = computed(() => {
  const t = peelT.value
  return {
    transform: `translate(${t * 62}%, ${-t * 46}%) rotate(${-14 * t}deg)`,
    opacity: String(Math.max(0, 1 - t * 0.92)),
  }
})

function clearTimer(): void {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

function push(): void {
  if (empty.value || step.value !== 'ready') return
  step.value = 'ironing'
  progress.value = 0
  const started = Date.now()
  const total = 2600
  clearTimer()
  timer = window.setInterval(() => {
    const t = Math.min(1, (Date.now() - started) / total)
    // 先慢后快的加热曲线，最后一下"叮"
    progress.value = t * t * (3 - 2 * t)
    flashes.value = Math.floor(t * 6)
    if (t >= 1) {
      clearTimer()
      step.value = 'done'
      playChime()
    }
  }, 60)
}

function again(): void {
  clearPeel()
  step.value = 'ready'
  progress.value = 0
  peelT.value = 0
}

function clearPeel(): void {
  if (peelTimer !== null) {
    window.clearInterval(peelTimer)
    peelTimer = null
  }
}

/** 撕豆：趁热把烘焙纸从一角掀起来，是拼豆最有成就感的一下。 */
function peel(): void {
  if (step.value !== 'done') return
  step.value = 'peeling'
  peelT.value = 0
  const started = Date.now()
  const total = 900
  clearPeel()
  peelTimer = window.setInterval(() => {
    const t = Math.min(1, (Date.now() - started) / total)
    peelT.value = t * t * (3 - 2 * t)
    if (t >= 1) {
      clearPeel()
      step.value = 'peeled'
      playChime()
    }
  }, 40)
}

function save(): void {
  emit('saved')
  emit('close')
}

onBeforeUnmount(() => {
  clearTimer()
  clearPeel()
})
</script>

<template>
  <Modal title="自动熨烫机" wide @close="emit('close')">
    <div class="iron">
      <p class="iron-caption">
        <span class="iron-eyebrow">PERLER WORKSHOP</span>
        {{
          step === 'ready'
            ? '把托盘推上去'
            : step === 'ironing'
              ? '正在熨烫，别急着掀'
              : step === 'done'
                ? '熨好啦，撕开看看'
                : step === 'peeling'
                  ? '趁热，慢慢掀开'
                  : '成品出来啦'
        }}
      </p>
      <p class="hint iron-sub">
        {{
          step === 'ready'
            ? '烘焙纸已经盖好，向上推入机器开始这次制作。'
            : step === 'ironing'
              ? '机器在慢慢压平豆子，你能听见细碎的塑料软化声。'
              : step === 'done'
                ? '撕豆才是拼豆的灵魂时刻——从一角慢慢掀，别扯到旁边。'
                : step === 'peeling'
                  ? '纸一离开，豆子就定型了。'
                  : '趁还热的时候揭下来，边缘会更圆润。'
        }}
      </p>

      <!-- 机器：屏幕 + 出纸口的纸 -->
      <div class="iron-machine">
        <div class="iron-screen">
          <span class="iron-led" :class="{ on: step !== 'ready' }"></span>
          <strong>{{ step === 'ready' ? 'READY' : step === 'ironing' ? 'IRONING' : 'DONE' }}</strong>
          <em>PERLER LAB</em>
        </div>
        <div class="iron-slots">
          <span v-for="i in 3" :key="i" :class="{ lit: step !== 'ready' && flashes >= i }"></span>
        </div>
        <div class="iron-mouth"></div>
        <div class="iron-sheet" :class="{ in: step === 'ironing', out: step !== 'ready' && step !== 'ironing' }"></div>
      </div>

      <div class="iron-bar" :class="{ live: step === 'ironing' }">
        <div class="iron-bar-fill" :style="{ width: Math.round(progress * 100) + '%' }"></div>
      </div>

      <!-- 成品预览 + 烘焙纸 -->
      <div v-if="step !== 'ready' && step !== 'ironing'" class="iron-result">
        <div class="iron-peel-stage">
          <img v-if="preview" :src="preview" alt="成品预览" />
          <div v-if="step !== 'peeled'" class="iron-paper" :style="paperStyle">
            <span class="iron-paper-tex"></span>
            <span class="iron-paper-grip">掀</span>
          </div>
        </div>
        <p class="hint">
          当前烫法：{{ store.finishInfo.name }} · {{ peelT >= 1 || step === 'peeled' ? '已撕开，成品定型' : '烘焙纸还盖着' }}
        </p>
      </div>

      <div class="iron-picks">
        <button
          v-for="f in IRON_FINISHES"
          :key="f.id"
          class="finish-chip"
          :class="{ on: store.finish === f.id }"
          :title="f.desc"
          @click="store.setFinish(f.id)"
        >
          {{ f.name }}
        </button>
      </div>

      <div class="iron-actions">
        <button v-if="step === 'ready'" class="btn primary" :disabled="empty" @click="push">
          ↑ 向上推入托盘
        </button>
        <template v-else-if="step === 'ironing'">
          <button class="btn" disabled>熨烫中…</button>
        </template>
        <template v-else-if="step === 'done'">
          <button class="btn" @click="again">再熨一次</button>
          <button class="btn primary" @click="peel">✋ 撕开烘焙纸</button>
        </template>
        <template v-else-if="step === 'peeling'">
          <button class="btn" disabled>正在掀开…</button>
        </template>
        <template v-else>
          <button class="btn" @click="again">再熨一次</button>
          <button class="btn primary" @click="save">保存这个效果</button>
        </template>
      </div>
      <p v-if="empty" class="hint">这张图纸还是空的，先放几颗豆子再来熨。</p>
    </div>
  </Modal>
</template>
