<script setup lang="ts">
// FWA StatusChip — pill chip with a semantic tint background + matching solid text.
// Maps the design-system statuses onto Nuxt UI's soft badge variant.
type Status = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const props = withDefaults(defineProps<{ status?: Status }>(), {
  status: 'neutral'
})

const color = computed(() => props.status)
</script>

<template>
  <UBadge :color="color" variant="soft" size="sm" class="rounded-full font-semibold">
    <slot />
  </UBadge>
</template>
