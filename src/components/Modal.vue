<script setup lang="ts">
defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <section class="sheet" :class="{ wide: !!wide }" role="dialog">
      <header class="sheet-head">
        <span class="sheet-title">{{ title }}</span>
        <button class="btn icon ghost" aria-label="关闭" @click="emit('close')">✕</button>
      </header>
      <div class="sheet-body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="sheet-foot">
        <slot name="footer" />
      </footer>
    </section>
  </div>
</template>
