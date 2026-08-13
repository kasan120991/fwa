<script setup lang="ts">
useHead({ title: 'Invoices · Francis Web Agency' })
const api = useApi()

interface Invoice {
  id: number
  number: string | null
  kind: 'deposit' | 'balance' | 'custom'
  status: 'open' | 'paid' | 'uncollectible' | 'void'
  amount_due: number
  amount_paid: number
  is_overdue: boolean
  due_date: string | null
  paid_at: string | null
  created_at: string | null
}
const invoices = ref<Invoice[]>([])
const pending = ref(true)
const socket = useSocket()

async function load() {
  const { data } = await api<{ data: Invoice[] }>('/portal/invoices')
  invoices.value = data
}
onMounted(async () => {
  try {
    await load()
  } finally {
    pending.value = false
  }
  socket.on('invoice:changed', load)
})
onBeforeUnmount(() => socket.off('invoice:changed', load))

const KIND_LABEL: Record<string, string> = { deposit: 'Deposit', balance: 'Final', custom: 'Invoice' }

function invoiceNo(i: Invoice) {
  return i.number || `Invoice #${i.id}`
}
function remaining(i: Invoice) {
  return Math.max(0, (i.amount_due ?? 0) - (i.amount_paid ?? 0)) || i.amount_due
}
function chip(i: Invoice) {
  if (i.status === 'paid') return { label: 'Paid', class: 'bg-success/10 text-success' }
  if (i.is_overdue) return { label: 'Overdue', class: 'bg-error/10 text-error' }
  if (i.status === 'open') {
    const days = daysFromNow(i.due_date)
    if (days != null && days <= 14) return { label: 'Due Soon', class: 'bg-warning/10 text-warning' }
    return { label: 'Open', class: 'bg-mist text-primary' }
  }
  return { label: formatStatus(i.status), class: 'bg-mist text-muted' }
}

// Urgency order: overdue first, then earliest due date, undated last.
const open = computed(() => invoices.value
  .filter(i => i.status === 'open')
  .sort((a, b) =>
    (Number(b.is_overdue) - Number(a.is_overdue))
    || String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999'))
    || a.id - b.id))
const focus = computed(() => open.value[0] || null)
const otherOpen = computed(() => open.value.slice(1))
const history = computed(() => invoices.value.filter(i => i.status !== 'open'))
</script>

<template>
  <div class="flex flex-col gap-7">
    <div>
      <p class="eyebrow text-primary">
        Billing
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-tight text-highlighted">
        Invoices
      </h1>
    </div>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="!invoices.length"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-semibold text-highlighted">
        No invoices yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Invoices we send you will show up here.
      </p>
    </div>

    <template v-else>
      <!-- The bill on the counter — most urgent invoice, or the all-clear -->
      <section
        v-if="focus"
        class="flex flex-wrap items-end gap-x-10 gap-y-6 rounded-band bg-sand p-7 sm:p-8"
      >
        <div>
          <p class="eyebrow">
            Due Next · {{ invoiceNo(focus) }} · {{ KIND_LABEL[focus.kind] }}
          </p>
          <div class="mt-2.5 font-display text-[2.6rem] font-bold leading-none tracking-[-0.028em] tabular-nums text-highlighted">
            {{ formatMoney(remaining(focus)) }}
          </div>
          <p class="mt-2.5 text-[13.5px] text-muted">
            <template v-if="focus.is_overdue">
              <span class="font-semibold text-error">Overdue</span> — was due {{ shortDate(focus.due_date) }}
            </template>
            <template v-else-if="focus.due_date">
              Due {{ shortDate(focus.due_date) }}
            </template>
            <template v-else>
              Ready when you are
            </template>
          </p>
        </div>
        <div class="ml-auto flex items-center gap-3">
          <NuxtLink
            :to="`/invoices/${focus.id}`"
            class="inline-flex items-center rounded-btn border border-accented px-4 py-2 text-[13px] font-semibold text-highlighted transition-colors hover:border-citrine hover:bg-citrine hover:text-ink-900"
          >
            View Invoice
          </NuxtLink>
          <NuxtLink
            :to="`/invoices/${focus.id}`"
            class="inline-flex items-center rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-inverted transition-colors hover:bg-primary/90"
          >
            Pay Now
          </NuxtLink>
        </div>
      </section>

      <section
        v-else
        class="rounded-band bg-sand p-7 sm:p-8"
      >
        <p class="eyebrow">
          Billing
        </p>
        <h3 class="mt-2 font-display text-[1.35rem] font-semibold text-highlighted">
          You're all paid up
        </h3>
        <p class="mt-1 text-[13.5px] text-muted">
          Nothing is due right now — new invoices will show up here first.
        </p>
      </section>

      <!-- other open invoices -->
      <div
        v-if="otherOpen.length"
        class="flex flex-col gap-3"
      >
        <div
          v-for="i in otherOpen"
          :key="i.id"
          class="flex flex-wrap items-center gap-4 rounded-card bg-default px-5 py-4 ring ring-default"
        >
          <NuxtLink
            :to="`/invoices/${i.id}`"
            class="text-[14px] font-semibold tabular-nums text-highlighted hover:underline"
          >
            {{ invoiceNo(i) }}
          </NuxtLink>
          <span class="text-[12.5px] text-muted">{{ KIND_LABEL[i.kind] }}<template v-if="i.due_date"> · due {{ shortDate(i.due_date) }}</template></span>
          <span
            class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
            :class="chip(i).class"
          >{{ chip(i).label }}</span>
          <span class="ml-auto flex items-center gap-4">
            <span class="text-[14px] font-semibold tabular-nums text-highlighted">{{ formatMoney(remaining(i)) }}</span>
            <NuxtLink
              :to="`/invoices/${i.id}`"
              class="inline-flex items-center rounded-btn border border-accented px-3.5 py-1.5 text-[12.5px] font-semibold text-highlighted transition-colors hover:border-citrine hover:bg-citrine hover:text-ink-900"
            >
              Pay
            </NuxtLink>
          </span>
        </div>
      </div>

      <!-- history -->
      <section v-if="history.length">
        <p class="eyebrow">
          History
        </p>
        <div class="mt-1">
          <NuxtLink
            v-for="i in history"
            :key="i.id"
            :to="`/invoices/${i.id}`"
            class="flex flex-wrap items-center gap-4 border-t border-default py-3.5 transition-colors first:border-t-0 hover:bg-muted/50"
          >
            <span class="text-[13.5px] font-medium tabular-nums text-muted">{{ invoiceNo(i) }}</span>
            <span class="text-[12.5px] text-muted">{{ KIND_LABEL[i.kind] }}<template v-if="i.status === 'paid' && (i.paid_at || i.due_date)"> · Paid {{ shortDate(i.paid_at || i.due_date) }}</template></span>
            <span
              class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
              :class="chip(i).class"
            >{{ chip(i).label }}</span>
            <span class="ml-auto flex items-center gap-4 text-[12.5px]">
              <span class="font-medium tabular-nums text-muted">{{ formatMoney(i.amount_due) }}</span>
              <span class="font-medium text-highlighted underline decoration-1 underline-offset-2">View</span>
            </span>
          </NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>
