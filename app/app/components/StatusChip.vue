<script setup lang="ts">
// FWA StatusChip — 4px chip with a semantic tint background + matching solid
// text (Highlighter §5.4). Maps statuses onto Nuxt UI's soft badge variant.
type Status = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const props = withDefaults(defineProps<{ status?: Status, size?: 'sm' | 'md' | 'lg' }>(), {
  status: 'neutral',
  size: 'sm'
})

const color = computed(() => props.status)
</script>

<template>
  <UBadge :color="color" variant="soft" :size="size" class="rounded-chip font-semibold">
    <slot />
  </UBadge>
</template>
