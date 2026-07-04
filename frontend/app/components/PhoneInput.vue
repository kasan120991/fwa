<script setup lang="ts">
// Phone field that masks input as you type — v-model is the RAW digits (what we
// store), while the visible value is formatted, e.g. "(555) 123-4567". Wraps
// UInput so it matches every other field.
const model = defineModel<string>({ default: '' })

withDefaults(defineProps<{ placeholder?: string }>(), {
  placeholder: '(555) 000-0000'
})

const display = ref(formatPhone(model.value))

// Reflect external changes to the raw value (e.g. loading a contact to edit).
watch(model, (v) => {
  const masked = formatPhone(v ?? '')
  if (masked !== display.value) display.value = masked
})

// As the user types, sanitize to digits (US-capped at 10), reformat the visible
// value, and push the raw digits up. Resetting `display` to the masked string is
// a real value change, so UInput rewrites the DOM and strays never linger.
watch(display, (v) => {
  // 15 = E.164 max, so 10-digit US, 11-digit +1, and international numbers all
  // survive; only pathological input is trimmed.
  const digits = phoneDigits(v).slice(0, 15)
  const masked = formatPhone(digits)
  if (masked !== v) display.value = masked
  if (digits !== (model.value ?? '')) model.value = digits
})
</script>

<template>
  <UInput
    v-model="display"
    type="tel"
    inputmode="tel"
    icon="i-lucide-phone"
    size="lg"
    :placeholder="placeholder"
    class="w-full"
  />
</template>
