<script setup lang="ts">
// Shown only on the demo instance (NUXT_PUBLIC_DEMO_MODE). Citrine flood with
// ink text — the accent is never the type colour, only the ground behind it.
const demoMode = useRuntimeConfig().public.demoMode
</script>

<template>
  <div
    v-if="demoMode"
    class="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 bg-citrine px-4 py-2 text-center text-ink-950"
  >
    <span class="eyebrow">Demo Workspace</span>
    <span class="text-[0.8125rem] leading-snug">
      Sample data — everything resets nightly, so click around freely.
    </span>
    <a
      href="https://franciswebagency.com/contact"
      target="_blank"
      rel="noopener"
      class="text-[0.8125rem] font-medium leading-snug underline underline-offset-2"
    >
      Talk to us
    </a>
  </div>
</template>
