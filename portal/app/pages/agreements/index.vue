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
  expires_at: string | null
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
  draft: { label: 'Draft', class: 'bg-mist text-muted' },
  sent: { label: 'Awaiting You', class: 'bg-warning/10 text-warning' },
  viewed: { label: 'Awaiting You', class: 'bg-warning/10 text-warning' },
  accepted: { label: 'Accepted', class: 'bg-success/10 text-success' },
  signed: { label: 'Signed', class: 'bg-success/10 text-success' },
  declined: { label: 'Declined', class: 'bg-error/10 text-error' },
  expired: { label: 'Expired', class: 'bg-mist text-muted' },
  voided: { label: 'Voided', class: 'bg-mist text-muted' }
}
function chip(a: Agreement) {
  return STATUS_CHIP[a.status] || { label: formatStatus(a.status), class: 'bg-mist text-muted' }
}

// Statuses where an embedded signing session can be minted.
const SIGNABLE = new Set(['sent', 'viewed'])
function signable(a: Agreement) {
  return SIGNABLE.has(a.status)
}

// Closed paperwork fades back; signed contracts stay in force at full strength.
// An accepted proposal is history too — its contract carries the relationship.
function isPast(a: Agreement) {
  if (['expired', 'declined', 'voided'].includes(a.status)) return true
  return a.kind === 'proposal' && a.status === 'accepted'
}

// Docs needing a signature lead; everything else keeps the API's order.
const sorted = computed(() => [
  ...agreements.value.filter(a => signable(a)),
  ...agreements.value.filter(a => !signable(a) && !isPast(a)),
  ...agreements.value.filter(a => !signable(a) && isPast(a))
])

function kindLine(a: Agreement) {
  return `${a.kind === 'contract' ? 'Contract' : 'Proposal'} · ${chip(a).label}`
}
function dateLine(a: Agreement) {
  const parts: string[] = []
  if (signable(a)) {
    if (a.sent_at) parts.push(`Sent ${shortDate(a.sent_at)}`)
    if (a.expires_at) parts.push(`Expires ${shortDate(a.expires_at)}`)
  } else if (a.closed_at) {
    parts.push(`${a.status === 'accepted' ? 'Accepted' : a.status === 'signed' ? 'Signed' : 'Completed'} ${shortDate(a.closed_at)}`)
  } else if (a.status === 'expired' && a.expires_at) {
    if (a.sent_at) parts.push(`Sent ${shortDate(a.sent_at)}`)
    parts.push(`Expired ${shortDate(a.expires_at)}`)
  } else if (a.sent_at) {
    parts.push(`Sent ${shortDate(a.sent_at)}`)
  } else if (a.created_at) {
    parts.push(shortDate(a.created_at))
  }
  if (a.recurring && !isPast(a)) parts.push('Renews monthly')
  return parts.join(' · ')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <p class="eyebrow text-primary">
        Paperwork
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-tight text-highlighted">
        Agreements
      </h1>
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
      <h3 class="font-display text-lg font-semibold text-highlighted">
        No agreements yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Proposals and contracts we share with you will appear here.
      </p>
    </div>

    <!-- the filing cabinet -->
    <div
      v-else
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <NuxtLink
        v-for="a in sorted"
        :key="a.uid"
        :to="`/agreements/${a.uid}`"
        class="relative flex min-h-[172px] flex-col overflow-hidden rounded-card bg-default p-5.5 ring ring-default transition-colors hover:ring-primary"
        :class="[
          signable(a) ? 'before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-citrine' : '',
          isPast(a) ? 'opacity-75' : ''
        ]"
      >
        <div class="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          {{ kindLine(a) }}
        </div>
        <h3 class="mt-1.5 font-display text-[15.5px] font-semibold leading-snug text-highlighted">
          {{ a.title }}
        </h3>
        <p class="mt-1 text-[12px] text-muted">
          {{ dateLine(a) }}
        </p>
        <div class="mt-auto flex items-center justify-between gap-3 pt-4">
          <span
            v-if="a.total != null"
            class="text-[15px] font-bold tabular-nums text-highlighted"
          >
            {{ formatMoney(a.total) }}<span
              v-if="a.recurring"
              class="text-[11px] font-normal text-muted"
            >/mo</span>
          </span>
          <span v-else />
          <span
            v-if="signable(a)"
            class="inline-flex items-center rounded-btn bg-primary px-4 py-2 text-[13px] font-semibold text-inverted transition-colors group-hover:bg-primary/90"
          >
            Review &amp; Sign
          </span>
          <span
            v-else
            class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
            :class="chip(a).class"
          >{{ chip(a).label }}</span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
