<script setup lang="ts">
useHead({ title: 'Dashboard · Francis Web Agency' })

// Sample data — wired to the API in a later phase.
const revenueBars = [
  { month: 'Jan', pct: 52, current: false },
  { month: 'Feb', pct: 61, current: false },
  { month: 'Mar', pct: 50, current: false },
  { month: 'Apr', pct: 72, current: false },
  { month: 'May', pct: 80, current: false },
  { month: 'Jun', pct: 95, current: true }
]

const projects = [
  { name: 'Northwind storefront', client: 'Northwind Co.', stage: 'In build', status: 'info', value: '$9,000' },
  { name: 'Lumen marketing site', client: 'Lumen Labs', stage: 'Live', status: 'success', value: '$4,000' },
  { name: 'Parcel dashboard', client: 'Parcel', stage: 'Design', status: 'neutral', value: '$14,000' },
  { name: 'Harborview redesign', client: 'Harborview', stage: 'Review due', status: 'warning', value: '$6,500' },
  { name: 'Mintleaf checkout', client: 'Mintleaf', stage: 'Overdue', status: 'error', value: '$7,200' }
] as const

const attention = [
  { title: 'Mintleaf invoice overdue', meta: '$7,200 · 6 days past due', icon: 'i-lucide-triangle-alert', tone: 'error', chip: 'error', chipText: 'Overdue' },
  { title: 'Harborview review due', meta: 'Design review · today', icon: 'i-lucide-clock', tone: 'warning', chip: 'warning', chipText: 'Today' },
  { title: 'Parcel proposal unsigned', meta: '$14,000 · sent 3 days ago', icon: 'i-lucide-file-text', tone: 'info', chip: 'info', chipText: 'Awaiting' },
  { title: '3 tasks due this week', meta: 'Across 2 projects', icon: 'i-lucide-list-checks', tone: 'neutral', chip: 'neutral', chipText: '3 open' }
] as const

const attentionTone: Record<string, string> = {
  error: 'bg-error/10 text-error',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
  neutral: 'bg-muted text-default'
}

const agenda = [
  { time: '09:30', label: 'Team standup', dot: 'bg-teal-400' },
  { time: '13:00', label: 'Northwind kickoff call', dot: 'bg-teal-600' },
  { time: '16:00', label: 'Invoice review', dot: 'bg-warning' }
]
</script>

<template>
  <!-- KPI row -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Active clients" value="12" delta="+2" delta-tone="success" />
    <StatCard label="Active projects" value="14" delta="+3" delta-tone="success" />
    <StatCard label="Open tasks" value="28" delta="5 due today" delta-tone="muted" />
    <StatCard label="Outstanding invoices" value="$18.4k" delta="6 unpaid" delta-tone="muted" />
  </div>

  <!-- two-column region -->
  <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
    <!-- LEFT: chart + projects -->
    <div class="flex min-w-0 flex-col gap-5 lg:col-span-2">
      <!-- revenue snapshot -->
      <div class="rounded-card bg-default p-5 ring ring-default">
        <div class="mb-[22px] flex items-end justify-between gap-4">
          <div>
            <div class="mb-2 font-mono text-[11px] uppercase tracking-[0.06em] text-primary">Revenue booked</div>
            <div class="flex items-baseline gap-2.5">
              <span class="font-display text-[30px] font-medium leading-none tracking-tight text-highlighted tabular-nums">$210k</span>
              <span class="text-[13px] font-semibold text-success">+12%</span>
            </div>
            <div class="mt-1.5 text-[13px] text-muted">Last 6 months · vs. prior period</div>
          </div>
          <div class="hidden items-center gap-3.5 sm:flex">
            <span class="inline-flex items-center gap-1.5 text-xs text-muted"><span class="size-[9px] rounded-[2px] bg-teal-400" />Booked</span>
            <span class="inline-flex items-center gap-1.5 text-xs text-muted"><span class="size-[9px] rounded-[2px] bg-teal-600" />This month</span>
          </div>
        </div>
        <div class="flex h-[172px] items-end gap-4">
          <div v-for="bar in revenueBars" :key="bar.month" class="flex h-full flex-1 flex-col items-center justify-end gap-2.5">
            <div
              class="w-full max-w-[44px] rounded-t-[7px]"
              :class="bar.current ? 'bg-teal-600' : 'bg-teal-400'"
              :style="{ height: bar.pct + '%' }"
            />
            <span class="font-mono text-[11px]" :class="bar.current ? 'font-semibold text-highlighted' : 'text-muted'">{{ bar.month }}</span>
          </div>
        </div>
      </div>

      <!-- recent projects table -->
      <div class="overflow-hidden rounded-card bg-default ring ring-default">
        <div class="flex items-center justify-between border-b border-default px-[22px] py-[18px]">
          <div>
            <h2 class="text-base font-semibold text-highlighted">Recent projects</h2>
            <p class="mt-0.5 text-[13px] text-muted">5 active · 2 need attention</p>
          </div>
          <NuxtLink to="/projects" class="text-[13px] font-semibold text-primary">View all</NuxtLink>
        </div>
        <table class="w-full border-collapse">
          <thead>
            <tr>
              <th class="px-[22px] py-[11px] text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Project</th>
              <th class="px-[22px] py-[11px] text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Client</th>
              <th class="px-[22px] py-[11px] text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Stage</th>
              <th class="px-[22px] py-[11px] text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in projects" :key="row.name" class="border-t border-default">
              <td class="px-[22px] py-3.5 text-sm font-semibold text-highlighted">{{ row.name }}</td>
              <td class="px-[22px] py-3.5 text-sm text-default">{{ row.client }}</td>
              <td class="px-[22px] py-3.5"><StatusChip :status="row.status">{{ row.stage }}</StatusChip></td>
              <td class="px-[22px] py-3.5 text-right text-sm text-highlighted tabular-nums">{{ row.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- RIGHT: needs attention + agenda -->
    <div class="flex min-w-0 flex-col gap-5">
      <!-- needs attention -->
      <div class="overflow-hidden rounded-card bg-default ring ring-default">
        <div class="flex items-center justify-between border-b border-default px-5 py-[18px]">
          <h2 class="text-base font-semibold text-highlighted">Needs attention</h2>
          <span class="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-error/10 px-[7px] text-xs font-bold text-error">4</span>
        </div>
        <div class="flex flex-col">
          <div
            v-for="(item, i) in attention"
            :key="item.title"
            class="flex items-start gap-3 px-5 py-3.5"
            :class="i < attention.length - 1 ? 'border-b border-default' : ''"
          >
            <span class="inline-flex size-8 flex-none items-center justify-center rounded-[9px]" :class="attentionTone[item.tone]">
              <UIcon :name="item.icon" class="size-[17px]" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold leading-tight text-highlighted">{{ item.title }}</div>
              <div class="mt-0.5 text-[13px] text-muted tabular-nums">{{ item.meta }}</div>
            </div>
            <StatusChip :status="item.chip">{{ item.chipText }}</StatusChip>
          </div>
        </div>
      </div>

      <!-- today agenda -->
      <div class="overflow-hidden rounded-card bg-default ring ring-default">
        <div class="flex items-center justify-between border-b border-default px-5 py-[18px]">
          <h2 class="text-base font-semibold text-highlighted">Today</h2>
          <span class="font-mono text-[11px] uppercase tracking-[0.05em] text-muted">Thu · Jul 3</span>
        </div>
        <div class="flex flex-col">
          <div
            v-for="(ev, i) in agenda"
            :key="ev.time"
            class="flex items-center gap-3.5 px-5 py-[13px]"
            :class="i < agenda.length - 1 ? 'border-b border-default' : ''"
          >
            <span class="w-12 flex-none font-mono text-xs text-muted">{{ ev.time }}</span>
            <span class="size-2 flex-none rounded-full" :class="ev.dot" />
            <span class="text-sm font-medium text-highlighted">{{ ev.label }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
