<script setup lang="ts">
// A real activity feed, synthesized client-side from data already loaded on the
// page — no dedicated endpoint. Merges project/proposal/contract/invoice/task
// timestamps into one chronological timeline (mirrors the dashboard row style).
type ChipStatus = 'neutral' | 'info' | 'success' | 'warning' | 'error'
interface ProjectLike { code: string | null, status: string, created_at?: string | null, client_label: string }
interface Doc { id: number, title: string, status: string, total: number | null, created_at?: string | null, sent_at?: string | null, signed_at?: string | null }
interface ProjectInvoice { id: number, kind: 'deposit' | 'balance' | 'custom', status: string, number: string | null, amount_due: number, amount_paid: number, created_at?: string | null, finalized_at?: string | null, paid_at?: string | null }
interface Task { id: number, title: string, status: string, completed_at: string | null }

const props = defineProps<{
  project: ProjectLike
  proposals: Doc[]
  contracts: Doc[]
  invoices: ProjectInvoice[]
  tasks: Task[]
}>()

interface Event {
  key: string
  ts: number
  icon: string
  tone: 'brand' | 'success' | 'info' | 'warning' | 'neutral'
  title: string
  meta: string
  chip?: ChipStatus
  chipText?: string
}

const TONE: Record<Event['tone'], string> = {
  brand: 'bg-mist text-primary',
  success: 'bg-success/10 text-success',
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
  neutral: 'bg-muted text-muted'
}
const DOC_STATUS: Record<string, ChipStatus> = {
  draft: 'neutral', sent: 'info', viewed: 'info', signed: 'success', accepted: 'success',
  declined: 'error', expired: 'warning', voided: 'error', paid: 'success', open: 'info'
}
const KIND_LABEL: Record<ProjectInvoice['kind'], string> = { deposit: 'Deposit', balance: 'Final', custom: 'Invoice' }

function toTs(input?: string | null): number | null {
  if (!input) return null
  const d = new Date(input.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

const events = computed<Event[]>(() => {
  const out: Event[] = []
  const push = (ts: number | null, e: Omit<Event, 'ts'>) => {
    if (ts != null) out.push({ ...e, ts })
  }

  // project created
  push(toTs(props.project.created_at), {
    key: 'created', icon: 'i-lucide-folder-plus', tone: 'brand',
    title: `Project created for ${props.project.client_label}`,
    meta: props.project.created_at ? shortDate(props.project.created_at) : ''
  })

  // proposals
  for (const p of props.proposals) {
    push(toTs(p.created_at), {
      key: `prop-${p.id}`, icon: 'i-lucide-file-text', tone: 'info',
      title: `Proposal · ${p.title}`, meta: p.created_at ? shortDate(p.created_at) : '',
      chip: DOC_STATUS[p.status] || 'neutral', chipText: p.status
    })
  }

  // contracts — a sent + signed event where available, else the draft
  for (const c of props.contracts) {
    if (c.signed_at) {
      push(toTs(c.signed_at), {
        key: `ct-signed-${c.id}`, icon: 'i-lucide-file-signature', tone: 'success',
        title: 'Contract signed', meta: `${c.title} · ${shortDate(c.signed_at)}`
      })
    }
    if (c.sent_at) {
      push(toTs(c.sent_at), {
        key: `ct-sent-${c.id}`, icon: 'i-lucide-send', tone: 'info',
        title: 'Contract sent', meta: `${c.title} · ${shortDate(c.sent_at)}`
      })
    }
    if (!c.sent_at && !c.signed_at) {
      push(toTs(c.created_at), {
        key: `ct-${c.id}`, icon: 'i-lucide-file-text', tone: 'neutral',
        title: 'Contract drafted', meta: `${c.title}`,
        chip: DOC_STATUS[c.status] || 'neutral', chipText: c.status
      })
    }
  }

  // invoices — issued + paid
  for (const inv of props.invoices) {
    const label = KIND_LABEL[inv.kind]
    push(toTs(inv.finalized_at || inv.created_at), {
      key: `inv-${inv.id}`, icon: 'i-lucide-receipt', tone: 'info',
      title: `${label} invoice issued`,
      meta: [inv.number, formatMoney(inv.amount_due)].filter(Boolean).join(' · ')
    })
    if (inv.paid_at) {
      push(toTs(inv.paid_at), {
        key: `inv-paid-${inv.id}`, icon: 'i-lucide-badge-dollar-sign', tone: 'success',
        title: `${label} invoice paid`,
        meta: `${formatMoney(inv.amount_paid)} · ${shortDate(inv.paid_at)}`
      })
    }
  }

  // completed tasks
  for (const t of props.tasks) {
    if (t.status === 'done' && t.completed_at) {
      push(toTs(t.completed_at), {
        key: `task-${t.id}`, icon: 'i-lucide-check-circle-2', tone: 'success',
        title: `Task done · ${t.title}`, meta: timeAgo(t.completed_at)
      })
    }
  }

  return out.sort((a, b) => b.ts - a.ts)
})
</script>

<template>
  <div class="overflow-hidden rounded-card bg-default ring ring-default">
    <div class="flex items-center justify-between border-b border-default px-5 py-[18px]">
      <h2 class="text-base font-semibold text-highlighted">
        Activity
      </h2>
      <span class="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-mist px-[7px] text-xs font-bold text-primary tabular-nums">{{ events.length }}</span>
    </div>
    <div
      v-if="events.length"
      class="flex flex-col"
    >
      <div
        v-for="(e, i) in events"
        :key="e.key"
        class="flex items-start gap-3 px-5 py-3.5"
        :class="i < events.length - 1 ? 'border-b border-default' : ''"
      >
        <span
          class="inline-flex size-8 flex-none items-center justify-center rounded-[9px]"
          :class="TONE[e.tone]"
        >
          <UIcon
            :name="e.icon"
            class="size-[17px]"
          />
        </span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold leading-tight text-highlighted">
            {{ e.title }}
          </div>
          <div
            v-if="e.meta"
            class="mt-0.5 truncate text-[13px] text-muted tabular-nums"
          >
            {{ e.meta }}
          </div>
        </div>
        <StatusChip
          v-if="e.chip"
          :status="e.chip"
        >
          {{ e.chipText }}
        </StatusChip>
      </div>
    </div>
    <div
      v-else
      class="px-5 py-10 text-center text-sm text-muted"
    >
      No activity yet.
    </div>
  </div>
</template>
