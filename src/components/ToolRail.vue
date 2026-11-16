<script setup lang="ts">
import { useEditorStore, type ToolId } from '@/store/editor'

const store = useEditorStore()

interface ToolDef {
  id: ToolId
  label: string
  icon: string
  fill?: boolean
}

const groups: ToolDef[][] = [
  [
    { id: 'pencil', label: '画笔', icon: 'M4 20l1.2-4.2 9-9 3 3-9 9L4 20z M13.2 6.8l3 3' },
    { id: 'eraser', label: '橡皮', icon: 'M7 19h11 M8.5 16.5l-3-3 7.5-7.5 3 3-7.5 7.5z M5.5 13.5l4.5 4.5' },
    { id: 'bucket', label: '油漆桶', icon: 'M4.5 12.2l6.8-6.8 5.6 5.6-6.8 6.8z M14 5.4l2.2-2.2 M20 15.5c0 1.1-.9 2-2 2s-2-.9-2-2 2-3.2 2-3.2 2 2.1 2 3.2z' },
    { id: 'eyedropper', label: '吸管', icon: 'M14 5.5l4.5 4.5 M3.5 20.5l4-1 8.6-8.6-3-3-8.6 8.6-1 4z' }
  ],
  [
    { id: 'line', label: '直线', icon: 'M4 20L20 4' },
    { id: 'rect', label: '矩形', icon: 'M4 6h16v12H4z' },
    { id: 'rectFill', label: '实心矩形', icon: 'M4 6h16v12H4z', fill: true },
    { id: 'ellipse', label: '椭圆', icon: 'M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z' },
    { id: 'ellipseFill', label: '实心椭圆', icon: 'M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z', fill: true }
  ],
  [{ id: 'select', label: '框选', icon: 'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8 M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8 M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16 M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16' }]
]
</script>

<template>
  <nav class="rail">
    <template v-for="(group, gi) in groups" :key="gi">
      <div v-if="gi > 0" class="rail-sep" />
      <div class="rail-group">
        <button
          v-for="t in group"
          :key="t.id"
          class="tool"
          :class="{ active: store.tool === t.id }"
          :title="t.label"
          @click="store.tool = t.id"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            :stroke="t.fill ? 'none' : 'currentColor'"
            :fill-rule="'evenodd'"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="t.icon" :fill="t.fill ? 'currentColor' : 'none'" />
          </svg>
        </button>
      </div>
    </template>
  </nav>
</template>
