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

function chip(i: Invoice) {
  if (i.status === 'paid') return { label: 'Paid', class: 'bg-success/10 text-success' }
  if (i.is_overdue) return { label: 'Overdue', class: 'bg-warning/10 text-warning' }
  if (i.status === 'open') return { label: 'Open', class: 'bg-mist text-primary' }
  return { label: formatStatus(i.status), class: 'bg-muted text-muted' }
}
const KIND_LABEL: Record<string, string> = { deposit: 'Deposit', balance: 'Final', custom: 'Invoice' }
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <p class="eyebrow text-primary">
        Billing
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-medium leading-tight tracking-tight text-highlighted">
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
      <h3 class="font-display text-lg font-medium text-highlighted">
        No invoices yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Invoices we send you will show up here.
      </p>
    </div>

    <div
      v-else
      class="overflow-hidden rounded-card bg-default ring ring-default"
    >
      <NuxtLink
        v-for="i in invoices"
        :key="i.id"
        :to="`/invoices/${i.id}`"
        class="flex items-center gap-4 border-b border-default px-5 py-4 transition-colors last:border-0 hover:bg-muted/50"
      >
        <span class="inline-flex size-9 flex-none items-center justify-center rounded-[9px] bg-mist text-primary">
          <UIcon
            name="i-lucide-receipt-text"
            class="size-4.5"
          />
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-[14px] font-medium text-highlighted">
            {{ i.number || `Invoice #${i.id}` }}
          </div>
          <div class="text-[12.5px] text-muted">
            {{ KIND_LABEL[i.kind] }}<span v-if="i.due_date"> · Due {{ shortDate(i.due_date) }}</span>
          </div>
        </div>
        <span
          class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          :class="chip(i).class"
        >{{ chip(i).label }}</span>
        <span class="w-24 text-right text-[14px] font-semibold tabular-nums text-highlighted">
          {{ formatMoney(i.amount_due) }}
        </span>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-4 flex-none text-muted"
        />
      </NuxtLink>
    </div>
  </div>
</template>
