<script setup lang="ts">
// Rail money panel: fee, deposit/final split with invoice status, collected-to-
// date progress, and the one contextual billing button (the page runs it).
type InvStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
type ChipStatus = 'neutral' | 'info' | 'success' | 'warning' | 'error'
interface ProjectInvoice { id: number, kind: 'deposit' | 'balance' | 'custom', status: InvStatus, number: string | null, amount_due: number, amount_paid: number, is_overdue: boolean }
interface ProjectLike { project_fee: number | null, deposit_pct: number, hourly_rate: number | null }
interface BillingAction { label: string, icon: string, loading: boolean }

const props = defineProps<{
  project: ProjectLike
  invoices: ProjectInvoice[]
  billingAction: BillingAction | null
}>()
const emit = defineEmits<{ billing: [] }>()

const INV_STATUS: Record<InvStatus, { label: string, status: ChipStatus }> = {
  draft: { label: 'Draft', status: 'neutral' },
  open: { label: 'Open', status: 'info' },
  paid: { label: 'Paid', status: 'success' },
  uncollectible: { label: 'Uncollectible', status: 'error' },
  void: { label: 'Void', status: 'neutral' }
}
function invChip(i: ProjectInvoice): { label: string, status: ChipStatus } {
  return i.is_overdue ? { label: 'Overdue', status: 'warning' } : INV_STATUS[i.status]
}

const depositPct = computed(() => props.project.deposit_pct ?? 50)
const deposit = computed(() => (props.project.project_fee == null ? null : Math.round((props.project.project_fee * depositPct.value / 100) * 100) / 100))
const balance = computed(() => (props.project.project_fee == null || deposit.value == null ? null : Math.round((props.project.project_fee - deposit.value) * 100) / 100))
const depositInvoice = computed(() => props.invoices.find(i => i.kind === 'deposit'))
const finalInvoice = computed(() => props.invoices.find(i => i.kind === 'balance'))

// Collected-to-date across every invoice raised on this project.
const collected = computed(() => props.invoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0))
const collectedPct = computed(() => {
  const fee = props.project.project_fee
  if (!fee) return 0
  return Math.min(100, Math.round((collected.value / fee) * 100))
})
</script>

<template>
  <div class="rounded-card bg-default p-[18px] ring ring-default">
    <div class="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
      Project Fee
    </div>
    <div class="font-display text-[26px] font-medium tracking-tight text-highlighted tabular-nums">
      {{ formatMoney(project.project_fee) || '—' }}
    </div>

    <div class="mt-3 flex flex-col gap-2.5 text-[13px] text-muted">
      <div class="flex items-center justify-between gap-2">
        <span>Deposit ({{ depositPct }}%)</span>
        <div class="flex items-center gap-2">
          <StatusChip
            v-if="depositInvoice"
            :status="invChip(depositInvoice).status"
            :title="depositInvoice.number || undefined"
          >
            {{ invChip(depositInvoice).label }}
          </StatusChip>
          <span
            v-else
            class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted"
          >Not invoiced</span>
          <span class="font-semibold text-highlighted tabular-nums">{{ formatMoney(deposit) || '—' }}</span>
        </div>
      </div>
      <div class="flex items-center justify-between gap-2">
        <span>Final ({{ 100 - depositPct }}%)</span>
        <div class="flex items-center gap-2">
          <StatusChip
            v-if="finalInvoice"
            :status="invChip(finalInvoice).status"
            :title="finalInvoice.number || undefined"
          >
            {{ invChip(finalInvoice).label }}
          </StatusChip>
          <span
            v-else
            class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted"
          >Not invoiced</span>
          <span class="font-semibold text-highlighted tabular-nums">{{ formatMoney(balance) || '—' }}</span>
        </div>
      </div>
      <div
        v-if="project.hourly_rate"
        class="flex items-center justify-between gap-2"
      >
        <span>Hourly (extra)</span>
        <span class="font-semibold text-highlighted tabular-nums">{{ formatMoney(project.hourly_rate) }}</span>
      </div>
    </div>

    <!-- collected to date -->
    <div class="mt-4 border-t border-default pt-3.5">
      <div class="mb-1.5 flex items-center justify-between text-[12px]">
        <span class="text-muted">Collected</span>
        <span class="font-semibold text-highlighted tabular-nums">{{ formatMoney(collected) }} <span class="font-normal text-muted">· {{ collectedPct }}%</span></span>
      </div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-teal-500 transition-[width] duration-500"
          :style="{ width: collectedPct + '%' }"
        />
      </div>
    </div>

    <UButton
      v-if="billingAction"
      block
      color="primary"
      size="sm"
      :icon="billingAction.icon"
      class="mt-4 rounded-full"
      :loading="billingAction.loading"
      @click="emit('billing')"
    >
      {{ billingAction.label }}
    </UButton>
  </div>
</template>
