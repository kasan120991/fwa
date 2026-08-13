<script setup lang="ts">
const route = useRoute()
const api = useApi()

// uid is `proposal-5` / `contract-3` (the agreement union's uid).
const parsed = computed(() => {
  const [kind, idStr] = String(route.params.uid).split('-')
  const id = Number(idStr)
  return (kind === 'proposal' || kind === 'contract') && Number.isInteger(id) && id > 0
    ? { kind: kind as 'proposal' | 'contract', id }
    : null
})

interface Agreement {
  uid: string
  kind: 'proposal' | 'contract'
  title: string
  status: string
  total: number | null
  recurring: boolean
  sent_at: string | null
  expires_at: string | null
  closed_at: string | null
}
const doc = ref<Agreement | null>(null)

// The union list is small and already powers the Agreements page — one fetch
// gives this page its identity (title, value, dates); no per-doc endpoint.
onMounted(async () => {
  try {
    const { data } = await api<{ data: Agreement[] }>('/portal/agreements')
    doc.value = data.find(a => a.uid === String(route.params.uid)) ?? null
  } catch { /* header falls back to the generic label */ }
})

useHead({ title: () => `${doc.value?.title || 'Review & sign'} · Francis Web Agency` })

const STATUS_CHIP: Record<string, { label: string, class: string }> = {
  draft: { label: 'Draft', class: 'bg-mist text-muted' },
  sent: { label: 'Awaiting You', class: 'bg-warning/10 text-warning' },
  viewed: { label: 'Awaiting You', class: 'bg-warning/10 text-warning' },
  accepted: { label: 'Accepted', class: 'bg-success/10 text-success' },
  signed: { label: 'Signed', class: 'bg-success/10 text-success' },
  declined: { label: 'Declined', class: 'bg-error/10 text-error' },
  expired: { label: 'Expired', class: 'bg-mist text-muted' },
  voided: { label: 'Voided', class: 'bg-mist text-muted' }
}
const chip = computed(() => doc.value
  ? (STATUS_CHIP[doc.value.status] || { label: formatStatus(doc.value.status), class: 'bg-mist text-muted' })
  : null)

const metaLine = computed(() => {
  const kindLabel = parsed.value?.kind === 'contract' ? 'Contract' : 'Proposal'
  if (!doc.value) return kindLabel
  const d = doc.value
  const parts = [kindLabel]
  if (d.closed_at) {
    parts.push(`${d.status === 'accepted' ? 'Accepted' : d.status === 'signed' ? 'Signed' : 'Completed'} ${shortDate(d.closed_at)}`)
  } else {
    if (d.sent_at) parts.push(`Sent ${shortDate(d.sent_at)}`)
    if (d.expires_at) parts.push(`Expires ${shortDate(d.expires_at)}`)
  }
  return parts.join(' · ')
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- one-line header — the document below gets the room -->
    <div class="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <NuxtLink
        to="/agreements"
        aria-label="Back to agreements"
        class="inline-flex size-8 flex-none items-center justify-center rounded-btn text-muted transition-colors hover:bg-mist hover:text-highlighted"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4.5"
        />
      </NuxtLink>
      <div class="min-w-0">
        <h1 class="truncate font-display text-[1.35rem] font-semibold leading-tight tracking-tight text-highlighted">
          {{ doc?.title || 'Review & Sign' }}
        </h1>
        <p class="text-[12.5px] text-muted">
          {{ metaLine }}
        </p>
      </div>
      <span
        v-if="chip"
        class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
        :class="chip.class"
      >{{ chip.label }}</span>
      <span
        v-if="doc?.total != null"
        class="ml-auto text-[15px] font-bold tabular-nums text-highlighted"
      >
        {{ formatMoney(doc.total) }}<span
          v-if="doc.recurring"
          class="text-[11px] font-normal text-muted"
        >/mo</span>
      </span>
    </div>

    <PortalDocEmbed
      v-if="parsed"
      :id="parsed.id"
      :kind="parsed.kind"
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
