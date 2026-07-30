<script setup lang="ts">
const route = useRoute()

// uid is `proposal-5` / `contract-3` (the agreement union's uid).
const parsed = computed(() => {
  const [kind, idStr] = String(route.params.uid).split('-')
  const id = Number(idStr)
  return (kind === 'proposal' || kind === 'contract') && Number.isInteger(id) && id > 0
    ? { kind: kind as 'proposal' | 'contract', id }
    : null
})

useHead({ title: 'Review & sign · Francis Web Agency' })
</script>

<template>
  <div class="flex flex-col gap-6">
    <NuxtLink
      to="/agreements"
      class="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-highlighted"
    >
      <UIcon
        name="i-lucide-arrow-left"
        class="size-4"
      />
      Agreements
    </NuxtLink>

    <div>
      <p class="eyebrow text-primary">
        {{ parsed?.kind === 'contract' ? 'Contract' : 'Proposal' }}
      </p>
      <h1 class="mt-1 font-display text-[1.9rem] font-semibold leading-tight tracking-tight text-highlighted">
        Review &amp; Sign
      </h1>
    </div>

    <PortalDocEmbed
      v-if="parsed"
      :kind="parsed.kind"
      :id="parsed.id"
    />
    <div
      v-else
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-semibold text-highlighted">
        Agreement not found
      </h3>
    </div>
  </div>
</template>
