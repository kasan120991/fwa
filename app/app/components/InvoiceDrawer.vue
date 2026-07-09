<script setup lang="ts">
// Shared invoice detail slideover — used by the Invoices page and the client
// detail Invoices tab. Controlled by `v-model:invoice-id` (an id opens it, null
// closes it); fetches its own detail and emits `changed` after a void/payment so
// the host can refresh its list.
type Status = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
interface LineItem { id: number, name_snapshot: string, unit_price_snapshot: number, qty: number, line_total: number }
interface Payment { id: number, amount: number, method: string, note: string | null, paid_at: string | null }
interface InvoiceDetail {
  id: number
  number: string | null
  status: Status
  kind: string
  amount_due: number
  amount_paid: number
  currency: string
  description: string | null
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  due_date: string | null
  finalized_at: string | null
  paid_at: string | null
  created_at: string
  is_overdue: boolean
  client_id: number
  client_name: string | null
  client_company: string | null
  client_email: string | null
  items: LineItem[]
  payments: Payment[]
}

const props = defineProps<{ invoiceId: number | null }>()
const emit = defineEmits<{ 'update:invoiceId': [number | null], 'changed': [] }>()

const api = useApi()
const toast = useToast()

const STATUS_META: Record<Status, { label: string, status: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  draft: { label: 'Draft', status: 'neutral' },
  open: { label: 'Open', status: 'info' },
  paid: { label: 'Paid', status: 'success' },
  uncollectible: { label: 'Uncollectible', status: 'error' },
  void: { label: 'Void', status: 'neutral' }
}
function chip(inv: { status: Status, is_overdue: boolean }) {
  if (inv.is_overdue) return { label: 'Overdue', status: 'warning' as const }
  return STATUS_META[inv.status]
}
const AVATAR = ['bg-teal-800 text-white', 'bg-mist text-primary', 'bg-sand text-highlighted', 'bg-info/10 text-info', 'bg-muted text-default']
const clientName = (i: { client_company: string | null, client_name: string | null }) => i.client_company || i.client_name || 'Unknown'

const detail = ref<InvoiceDetail | null>(null)
const detailLoading = ref(false)
const drawerOpen = computed({
  get: () => props.invoiceId != null,
  set: (v) => { if (!v) emit('update:invoiceId', null) }
})

async function fetchDetail(id: number) {
  const { data } = await api<{ data: InvoiceDetail }>(`/invoices/${id}`)
  detail.value = data
}
watch(() => props.invoiceId, async (id) => {
  if (id == null) {
    detail.value = null
    return
  }
  detailLoading.value = true
  try {
    await fetchDetail(id)
  } finally {
    detailLoading.value = false
  }
}, { immediate: true })

async function voidInvoice(id: number) {
  try {
    await api(`/invoices/${id}/void`, { method: 'POST' })
    toast.add({ title: 'Invoice voided', color: 'success' })
    if (props.invoiceId === id) await fetchDetail(id)
    emit('changed')
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not void invoice', description: e?.data?.error?.message, color: 'error' })
  }
}
function copyLink(url: string) {
  navigator.clipboard?.writeText(url)
  toast.add({ title: 'Invoice link copied', color: 'success' })
}

// ---- record payment modal ----
const payOpen = ref(false)
const payAmount = ref<number | null>(null)
const payMethod = ref('manual')
const payNote = ref('')
const paying = ref(false)
const METHOD_ITEMS = [
  { label: 'Manual / Offline', value: 'manual' },
  { label: 'Card', value: 'card' },
  { label: 'Bank Transfer', value: 'bank' },
  { label: 'Other', value: 'other' }
]
function openPay() {
  if (!detail.value) return
  payAmount.value = Math.round((detail.value.amount_due - detail.value.amount_paid) * 100) / 100
  payMethod.value = 'manual'
  payNote.value = ''
  payOpen.value = true
}
async function submitPay() {
  if (!detail.value || paying.value) return
  paying.value = true
  try {
    const id = detail.value.id
    await api(`/invoices/${id}/pay`, { method: 'POST', body: { amount: payAmount.value, method: payMethod.value, note: payNote.value || undefined } })
    toast.add({ title: 'Payment recorded', color: 'success' })
    payOpen.value = false
    await fetchDetail(id)
    emit('changed')
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not record payment', description: e?.data?.error?.message, color: 'error' })
  } finally {
    paying.value = false
  }
}
</script>

<template>
  <USlideover
    v-model:open="drawerOpen"
    :ui="{ content: 'w-[480px] max-w-[94vw]' }"
  >
    <template #content>
      <div
        v-if="detail"
        class="flex h-full flex-col"
      >
        <!-- header -->
        <div class="flex-none border-b border-default px-6 py-5">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[17px] font-semibold leading-tight text-highlighted">
                {{ detail.number || 'Draft invoice' }}
              </div>
              <NuxtLink
                :to="`/clients/${detail.client_id}`"
                class="mt-1.5 inline-flex items-center gap-2 transition-opacity hover:opacity-80"
              >
                <span
                  class="inline-flex size-[22px] flex-none items-center justify-center rounded-md text-[9.5px] font-semibold"
                  :class="AVATAR[detail.client_id % AVATAR.length]"
                >{{ initials(clientName(detail)) }}</span>
                <span class="text-[13px] font-medium text-primary">{{ clientName(detail) }}</span>
              </NuxtLink>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="outline"
              square
              size="sm"
              aria-label="Close"
              @click="() => { drawerOpen = false }"
            />
          </div>
          <div class="mt-3.5 flex flex-wrap items-center gap-2">
            <StatusChip :status="chip(detail).status">
              {{ chip(detail).label }}
            </StatusChip>
            <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted">{{ detail.kind }}</span>
          </div>
          <div class="mt-3.5 flex items-baseline gap-2">
            <span class="font-display text-[26px] font-medium tracking-tight text-highlighted tabular-nums">{{ formatMoney(detail.amount_due) }}</span>
            <span class="text-[13px] text-muted">{{ detail.amount_paid > 0 ? `${formatMoney(detail.amount_paid)} paid` : 'due' }}</span>
          </div>
        </div>

        <!-- body -->
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div class="mb-2.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
            Line items
          </div>
          <div class="mb-6 overflow-hidden rounded-xl ring-1 ring-default">
            <div
              v-for="li in detail.items"
              :key="li.id"
              class="flex items-center justify-between gap-3.5 border-b border-default px-3.5 py-3 last:border-b-0"
            >
              <div class="min-w-0">
                <div class="truncate text-[13.5px] font-medium text-highlighted">
                  {{ li.name_snapshot }}
                </div>
                <div class="mt-0.5 text-xs text-muted tabular-nums">
                  {{ li.qty }} × {{ formatMoney(li.unit_price_snapshot) }}
                </div>
              </div>
              <span class="whitespace-nowrap text-[13.5px] font-semibold text-highlighted tabular-nums">{{ formatMoney(li.line_total) }}</span>
            </div>
            <div class="flex items-center justify-between bg-muted px-3.5 py-3">
              <span class="text-[13px] font-semibold text-highlighted">Total</span>
              <span class="text-[15px] font-bold text-highlighted tabular-nums">{{ formatMoney(detail.amount_due) }}</span>
            </div>
          </div>

          <div
            v-if="detail.payments.length"
            class="mb-6"
          >
            <div class="mb-2.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
              Payments
            </div>
            <div class="flex flex-col gap-2">
              <div
                v-for="p in detail.payments"
                :key="p.id"
                class="flex items-center justify-between rounded-lg bg-muted px-3.5 py-2.5"
              >
                <span class="inline-flex items-center gap-2 text-[13px] text-default">
                  <UIcon
                    name="i-lucide-check-circle-2"
                    class="size-4 text-success"
                  />
                  <span class="capitalize">{{ p.method }}</span>
                  <span
                    v-if="p.note"
                    class="text-muted"
                  >· {{ p.note }}</span>
                </span>
                <span class="text-[13.5px] font-semibold text-highlighted tabular-nums">{{ formatMoney(p.amount) }}</span>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-2 text-[13px]">
            <div class="flex justify-between">
              <span class="text-muted">Due date</span><span class="text-default tabular-nums">{{ detail.due_date ? shortDate(detail.due_date) : '—' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">Issued</span><span class="text-default tabular-nums">{{ detail.finalized_at ? shortDate(detail.finalized_at) : '—' }}</span>
            </div>
            <div
              v-if="detail.paid_at"
              class="flex justify-between"
            >
              <span class="text-muted">Paid</span><span class="text-default tabular-nums">{{ shortDate(detail.paid_at) }}</span>
            </div>
          </div>
        </div>

        <!-- footer actions -->
        <div class="flex-none border-t border-default px-6 py-4">
          <div class="flex flex-wrap items-center justify-end gap-2.5">
            <UButton
              v-if="detail.hosted_invoice_url"
              color="neutral"
              variant="outline"
              class="rounded-full"
              icon="i-lucide-link"
              @click="copyLink(detail.hosted_invoice_url!)"
            >
              Copy link
            </UButton>
            <UButton
              v-if="detail.hosted_invoice_url"
              :to="detail.hosted_invoice_url"
              target="_blank"
              rel="noopener"
              color="neutral"
              variant="outline"
              class="rounded-full"
              icon="i-simple-icons-stripe"
              trailing-icon="i-lucide-external-link"
            >
              Open In Stripe
            </UButton>
            <UButton
              v-if="detail.invoice_pdf"
              :to="detail.invoice_pdf"
              target="_blank"
              rel="noopener"
              color="neutral"
              variant="outline"
              class="rounded-full"
              icon="i-lucide-download"
              aria-label="Download PDF"
              title="Download PDF"
            >
              PDF
            </UButton>
            <UButton
              v-if="detail.status === 'open' || detail.status === 'draft'"
              color="neutral"
              variant="outline"
              class="rounded-full"
              icon="i-lucide-ban"
              @click="voidInvoice(detail.id)"
            >
              Void
            </UButton>
            <UButton
              v-if="detail.status === 'open'"
              color="primary"
              class="rounded-full"
              icon="i-lucide-hand-coins"
              @click="openPay"
            >
              Record Payment
            </UButton>
          </div>
        </div>
      </div>
      <div
        v-else
        class="flex h-full items-center justify-center text-sm text-muted"
      >
        {{ detailLoading ? 'Loading…' : 'Select an invoice' }}
      </div>
    </template>
  </USlideover>

  <!-- record payment modal -->
  <UModal
    v-model:open="payOpen"
    title="Record Payment"
    :ui="{ content: 'sm:max-w-md' }"
  >
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField label="Amount">
            <UInput
              v-model.number="payAmount"
              type="number"
              min="0"
              step="0.01"
              icon="i-lucide-dollar-sign"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Method">
            <USelect
              v-model="payMethod"
              :items="METHOD_ITEMS"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Note (Optional)">
            <UInput
              v-model="payNote"
              placeholder="Check #1042, bank ref…"
              size="lg"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2.5">
          <UButton
            color="neutral"
            variant="outline"
            class="rounded-full"
            @click="() => { payOpen = false }"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            class="rounded-full"
            :loading="paying"
            @click="submitPay"
          >
            Record Payment
          </UButton>
        </div>
      </template>
    </UModal>
</template>
