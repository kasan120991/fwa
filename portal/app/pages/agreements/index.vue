<script setup lang="ts">
useHead({ title: 'Agreements · Francis Web Agency' })
const api = useApi()

interface Agreement {
  uid: string
  kind: 'proposal' | 'contract'
  id: number
  title: string
  status: string
  total: number | null
  recurring: boolean
  created_at: string | null
  sent_at: string | null
  closed_at: string | null
}
const agreements = ref<Agreement[]>([])
const pending = ref(true)

onMounted(async () => {
  try {
    const { data } = await api<{ data: Agreement[] }>('/portal/agreements')
    agreements.value = data
  } finally {
    pending.value = false
  }
})

const STATUS_CHIP: Record<string, { label: string, class: string }> = {
  draft: { label: 'Draft', class: 'bg-muted text-muted' },
  sent: { label: 'Awaiting you', class: 'bg-mist text-primary' },
  viewed: { label: 'Viewed', class: 'bg-mist text-primary' },
  accepted: { label: 'Accepted', class: 'bg-success/10 text-success' },
  signed: { label: 'Signed', class: 'bg-success/10 text-success' },
  declined: { label: 'Declined', class: 'bg-error/10 text-error' },
  expired: { label: 'Expired', class: 'bg-warning/10 text-warning' },
  voided: { label: 'Voided', class: 'bg-muted text-muted' }
}
function chip(a: Agreement) {
  return STATUS_CHIP[a.status] || { label: a.status, class: 'bg-muted text-muted' }
}
// Statuses where an embedded signing session can be minted.
const SIGNABLE = new Set(['sent', 'viewed'])
function signable(a: Agreement) {
  return SIGNABLE.has(a.status)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <p class="eyebrow text-primary">
        Paperwork
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-medium leading-tight tracking-tight text-highlighted">
        Agreements
      </h1>
      <p class="mt-1.5 text-[0.9375rem] text-muted">
        Your proposals and contracts with Francis Web Agency.
      </p>
    </div>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="!agreements.length"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-medium text-highlighted">
        No agreements yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Proposals and contracts we share with you will appear here.
      </p>
    </div>

    <div
      v-else
      class="overflow-hidden rounded-card bg-default ring ring-default"
    >
      <NuxtLink
        v-for="a in agreements"
        :key="a.uid"
        :to="`/agreements/${a.uid}`"
        class="flex items-center gap-4 border-b border-default px-5 py-4 transition-colors last:border-0 hover:bg-muted/50"
      >
        <span class="inline-flex size-9 flex-none items-center justify-center rounded-[9px] bg-mist text-primary">
          <UIcon
            :name="a.kind === 'contract' ? 'i-lucide-file-signature' : 'i-lucide-file-text'"
            class="size-4.5"
          />
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-[14px] font-medium text-highlighted">
            {{ a.title }}
          </div>
          <div class="text-[12.5px] text-muted">
            {{ a.kind === 'contract' ? 'Contract' : 'Proposal' }}
            <span v-if="a.sent_at"> · Sent {{ shortDate(a.sent_at) }}</span>
            <span v-if="a.closed_at"> · Completed {{ shortDate(a.closed_at) }}</span>
          </div>
        </div>
        <span
          v-if="signable(a)"
          class="hidden rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary sm:inline"
        >Review &amp; sign</span>
        <span
          class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          :class="chip(a).class"
        >{{ chip(a).label }}</span>
        <span
          v-if="a.total != null"
          class="w-24 text-right text-[14px] font-semibold tabular-nums text-highlighted"
        >
          {{ formatMoney(a.total) }}<span
            v-if="a.recurring"
            class="text-[11px] font-normal text-muted"
          >/mo</span>
        </span>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-4 flex-none text-muted"
        />
      </NuxtLink>
    </div>
  </div>
</template>
