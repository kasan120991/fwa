<script setup lang="ts">
useHead({ title: 'Payments · Francis Web Agency' })

// Payments — received payments against invoices (Stripe charges + manually
// recorded offline payments). Live via payment:* sockets.
interface Payment {
  id: number
  amount: number
  currency: string
  method: 'card' | 'bank' | 'manual' | 'other'
  status: string
  note: string | null
  paid_at: string | null
  client_id: number
  client_name: string | null
  client_company: string | null
  invoice_id: number | null
  invoice_number: string | null
}

const api = useApi()
const socket = useSocket()
const toast = useToast()

const METHOD_META: Record<string, { label: string, class: string, icon: string }> = {
  card: { label: 'Card', class: 'bg-info/10 text-info', icon: 'i-lucide-credit-card' },
  bank: { label: 'Bank', class: 'bg-mist text-primary', icon: 'i-lucide-landmark' },
  manual: { label: 'Manual', class: 'bg-muted text-default', icon: 'i-lucide-hand-coins' },
  other: { label: 'Other', class: 'bg-muted text-muted', icon: 'i-lucide-circle-dollar-sign' }
}
const AVATAR = ['bg-teal-800 text-white', 'bg-mist text-primary', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']
const clientName = (p: Payment) => p.client_company || p.client_name || 'Unknown'

const payments = ref<Payment[]>([])
const stats = ref<{ received_30d: number, count_30d: number }>({ received_30d: 0, count_30d: 0 })
const pending = ref(true)

async function loadStats() {
  const { data } = await api<{ data: typeof stats.value }>('/payments/stats')
  stats.value = data
}
async function load() {
  try {
    const { data } = await api<{ data: Payment[] }>('/payments')
    payments.value = data
  } catch {
    toast.add({ title: 'Could not load payments', color: 'error' })
  } finally {
    pending.value = false
  }
}
function refresh() {
  load()
  loadStats()
}

onMounted(() => {
  refresh()
  socket.on('payment:created', refresh)
})
onBeforeUnmount(() => socket.off('payment:created', refresh))

const tiles = computed(() => [
  { key: 'received', label: 'Received (30d)', icon: 'i-lucide-banknote', value: formatMoney(stats.value.received_30d), sub: 'last 30 days' },
  { key: 'count', label: 'Payments (30d)', icon: 'i-lucide-receipt-text', value: String(stats.value.count_30d), sub: 'received' }
])
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="font-display text-[26px] font-medium tracking-tight text-highlighted">
            Payments
          </h1>
          <span class="rounded-full bg-mist px-2.5 py-0.5 text-[13px] font-semibold text-primary tabular-nums">{{ payments.length }}</span>
        </div>
        <p class="mt-1.5 text-sm text-muted">
          Payments received against your invoices — Stripe charges and offline payments you've recorded.
        </p>
      </div>
    </div>

    <!-- tiles -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-md">
      <div
        v-for="t in tiles"
        :key="t.key"
        class="rounded-[14px] border border-default bg-default p-4"
      >
        <div class="flex items-center justify-between gap-2.5">
          <span class="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted">{{ t.label }}</span>
          <span class="inline-flex size-7 items-center justify-center rounded-lg bg-mist text-primary"><UIcon
            :name="t.icon"
            class="size-[15px]"
          /></span>
        </div>
        <div class="mt-3 flex items-baseline gap-2">
          <span class="font-display text-[27px] font-medium leading-none tracking-tight text-highlighted tabular-nums">{{ t.value }}</span>
          <span class="text-[12.5px] text-muted">{{ t.sub }}</span>
        </div>
      </div>
    </div>

    <!-- table -->
    <div class="overflow-hidden rounded-card bg-default ring ring-default">
      <div
        v-if="pending"
        class="px-6 py-16 text-center text-sm text-muted"
      >
        Loading payments…
      </div>
      <template v-else-if="payments.length > 0">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="border-b border-default">
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Date
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Client
                </th>
                <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Method
                </th>
                <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted md:table-cell">
                  Invoice
                </th>
                <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in payments"
                :key="p.id"
                class="border-b border-default transition-colors last:border-b-0 hover:bg-muted"
              >
                <td class="whitespace-nowrap px-4 py-3.5 text-[13.5px] text-default tabular-nums">
                  {{ p.paid_at ? shortDate(p.paid_at) : '—' }}
                </td>
                <td class="px-4 py-3.5">
                  <NuxtLink
                    :to="`/clients/${p.client_id}`"
                    class="inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
                  >
                    <span
                      class="inline-flex size-7 flex-none items-center justify-center rounded-[7px] text-[11px] font-semibold"
                      :class="AVATAR[p.client_id % AVATAR.length]"
                    >{{ initials(clientName(p)) }}</span>
                    <span class="whitespace-nowrap text-[13.5px] font-medium text-default">{{ clientName(p) }}</span>
                  </NuxtLink>
                </td>
                <td class="px-4 py-3.5">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                    :class="METHOD_META[p.method]?.class"
                  ><UIcon
                    :name="METHOD_META[p.method]?.icon"
                    class="size-3.5"
                  />{{ METHOD_META[p.method]?.label }}</span>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-3.5 md:table-cell">
                  <NuxtLink
                    v-if="p.invoice_number"
                    to="/invoices"
                    class="text-[13.5px] font-medium text-primary hover:opacity-80"
                  >{{ p.invoice_number }}</NuxtLink>
                  <span
                    v-else
                    class="text-[13.5px] text-muted"
                  >—</span>
                </td>
                <td class="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-highlighted tabular-nums">
                  {{ formatMoney(p.amount) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-default px-5 py-3.5">
          <span class="text-[13px] text-muted tabular-nums">{{ payments.length }} payments</span>
        </div>
      </template>
      <div
        v-else
        class="flex flex-col items-center px-6 py-16 text-center"
      >
        <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
          name="i-lucide-banknote"
          class="size-6"
        /></span>
        <h3 class="font-display text-lg font-medium text-highlighted">
          No Payments Yet
        </h3>
        <p class="mt-1.5 max-w-xs text-sm text-muted">
          Payments appear here when a client pays an invoice or you record one manually.
        </p>
      </div>
    </div>
  </div>
</template>
