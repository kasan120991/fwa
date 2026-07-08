<script setup lang="ts">
// FWA TagInput — chip entry styled to match UInput (ring, focus ring, lg height).
// v-model is a string[]. Enter or comma commits the current token; Backspace on
// an empty field removes the last chip. Duplicates (case-insensitive) are ignored.
const model = defineModel<string[]>({ default: () => [] })

withDefaults(defineProps<{ placeholder?: string }>(), {
  placeholder: 'Add a tag…'
})

const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

function commit() {
  const value = draft.value.trim()
  draft.value = ''
  if (!value) return
  if (model.value.some(t => t.toLowerCase() === value.toLowerCase())) return
  model.value = [...model.value, value]
}

function removeAt(i: number) {
  model.value = model.value.filter((_, idx) => idx !== i)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    commit()
  } else if (e.key === 'Backspace' && draft.value === '' && model.value.length) {
    removeAt(model.value.length - 1)
  }
}
</script>

<template>
  <div
    class="flex min-h-[42px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg bg-default px-2 py-1.5 ring ring-inset ring-accented transition-shadow focus-within:ring-2 focus-within:ring-primary"
    @click="inputEl?.focus()"
  >
    <span
      v-for="(tag, i) in model"
      :key="tag"
      class="inline-flex items-center gap-1 rounded-full bg-elevated py-1 pl-2.5 pr-1 text-[13px] font-medium text-default"
    >
      {{ tag }}
      <button
        type="button"
        class="inline-flex size-4 items-center justify-center rounded-full text-muted transition-colors hover:bg-muted hover:text-highlighted"
        :aria-label="`Remove ${tag}`"
        @click.stop="removeAt(i)"
      >
        <UIcon name="i-lucide-x" class="size-3" />
      </button>
    </span>
    <input
      ref="inputEl"
      v-model="draft"
      type="text"
      :placeholder="model.length ? '' : placeholder"
      class="min-w-[80px] flex-1 bg-transparent px-1 text-sm text-highlighted outline-none placeholder:text-dimmed"
      @keydown="onKeydown"
      @blur="commit"
    >
  </div>
</template>
