<script setup lang="ts">
useHead({ title: 'Home · Francis Web Agency' })
const api = useApi()

interface Overview {
  client: { id: number, name: string, company: string | null } | null
  active_projects: number
  outstanding_balance: number
  open_tickets: number
}
interface Project {
  id: number
  name: string
  code: string | null
  status: string
  task_total: number
  task_done: number
  target_launch_date: string | null
  type_name: string | null
}
interface Invoice {
  id: number
  status: string
}
interface FileRow {
  id: number
  name: string
  mime: string | null
  size_bytes: number | null
  created_at: string | null
}
interface PortalNotification {
  id: number
  icon: string
  title: string
  body: string | null
  created_at: string | null
}

const overview = ref<Overview | null>(null)
const projects = ref<Project[]>([])
const openInvoices = ref<Invoice[]>([])
const files = ref<FileRow[]>([])
const activity = ref<PortalNotification[]>([])
const pending = ref(true)

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  awaiting_signature: 'Awaiting Signature',
  awaiting_deposit: 'Awaiting Deposit',
  in_progress: 'In Progress',
  in_review: 'In Review',
  awaiting_final: 'Awaiting Final',
  on_hold: 'On Hold',
  completed: 'Completed'
}

onMounted(async () => {
  try {
    const [ov, pr, inv, fi, no] = await Promise.allSettled([
      api<{ data: Overview }>('/portal/overview'),
      api<{ data: Project[] }>('/portal/projects'),
      api<{ data: Invoice[] }>('/portal/invoices'),
      api<{ data: FileRow[] }>('/portal/files'),
      api<{ data: PortalNotification[] }>('/portal/notifications', { query: { limit: 5 } })
    ])
    if (ov.status === 'fulfilled') overview.value = ov.value.data
    if (pr.status === 'fulfilled') {
      projects.value = pr.value.data.map(p => ({ ...p, task_total: Number(p.task_total ?? 0), task_done: Number(p.task_done ?? 0) }))
    }
    if (inv.status === 'fulfilled') openInvoices.value = inv.value.data.filter(i => i.status === 'open')
    if (fi.status === 'fulfilled') files.value = fi.value.data.slice(0, 3)
    if (no.status === 'fulfilled') activity.value = no.value.data.slice(0, 3)
  } finally {
    pending.value = false
  }
})

const greetName = computed(() => overview.value?.client?.company || overview.value?.client?.name || 'there')
const stats = computed(() => [
  { label: 'Active Projects', value: String(overview.value?.active_projects ?? 0), to: '/projects' },
  { label: 'Outstanding Balance', value: formatMoney(overview.value?.outstanding_balance ?? 0), to: '/invoices' },
  { label: 'Open Tickets', value: String(overview.value?.open_tickets ?? 0), to: '/support' }
])

// The band's single solid CTA — only when there's actually something to pay.
const payCta = computed(() => {
  const due = overview.value?.outstanding_balance ?? 0
  if (!due) return null
  return openInvoices.value.length === 1
    ? { label: `Pay Invoice · ${formatMoney(due)}`, to: `/invoices/${openInvoices.value[0]!.id}` }
    : { label: `Pay Balance · ${formatMoney(due)}`, to: '/invoices' }
})

// Work in motion first; completed projects live on the Projects page.
const homeProjects = computed(() => projects.value.filter(p => p.status !== 'completed').slice(0, 4))
function pct(p: Project) {
  return p.task_total ? Math.round((p.task_done / p.task_total) * 100) : 0
}
function projectMeta(p: Project) {
  return [p.code, p.type_name || 'Project'].filter(Boolean).join(' · ')
}
function fileIcon(f: FileRow) {
  if (f.mime?.includes('zip')) return 'i-lucide-archive'
  if (f.mime?.startsWith('image/')) return 'i-lucide-image'
  return 'i-lucide-file-text'
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <!-- The ink band — greeting + the numbers. One per page, per the system. -->
    <section class="rounded-band bg-deep p-7 sm:p-10 dark:ring dark:ring-default">
      <p class="eyebrow text-[#8C9096]">
        Client Portal
      </p>
      <h1 class="mt-2 font-display text-[1.75rem] font-bold leading-[1.1] tracking-[-0.028em] text-paper sm:text-[2.25rem]">
        Welcome back, {{ greetName }}
      </h1>
      <div class="mt-8 flex flex-wrap items-end gap-x-12 gap-y-6">
        <NuxtLink
          v-for="s in stats"
          :key="s.label"
          :to="s.to"
          class="group"
        >
          <div class="font-display text-[1.75rem] font-bold leading-none tabular-nums text-paper">
            {{ pending ? '—' : s.value }}
          </div>
          <div class="mb-2 mt-2.5 h-0.5 w-7 bg-citrine" />
          <div class="text-[12.5px] font-medium text-[#B0B3B0] transition-colors group-hover:text-paper">
            {{ s.label }}
          </div>
        </NuxtLink>
        <NuxtLink
          v-if="payCta"
          :to="payCta.to"
          class="mb-1 ml-auto inline-flex items-center rounded-btn bg-paper px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-[#F0F0EC]"
        >
          {{ payCta.label }}
        </NuxtLink>
      </div>
    </section>

    <!-- Projects in motion -->
    <section v-if="homeProjects.length">
      <div class="flex items-center justify-between">
        <p class="eyebrow">
          Your Projects
        </p>
        <NuxtLink
          to="/projects"
          class="text-[12.5px] font-medium text-primary hover:underline"
        >
          All projects
        </NuxtLink>
      </div>
      <div class="mt-3.5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NuxtLink
          v-for="p in homeProjects"
          :key="p.id"
          :to="`/projects/${p.id}`"
          class="flex flex-col rounded-card bg-default p-5 ring ring-default transition-shadow hover:ring-primary/40"
        >
          <div class="flex items-start justify-between gap-3">
            <h2 class="min-w-0 truncate font-display text-[1.05rem] font-semibold text-highlighted">
              {{ p.name }}
            </h2>
            <span class="whitespace-nowrap rounded-chip bg-mist px-2.5 py-1 text-[11px] font-semibold text-primary">
              {{ STATUS_LABEL[p.status] || formatStatus(p.status) }}
            </span>
          </div>
          <p class="mt-0.5 text-[12.5px] text-muted">
            {{ projectMeta(p) }}
          </p>
          <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-mist">
            <div
              class="h-full rounded-full bg-primary"
              :style="{ width: pct(p) + '%' }"
            />
          </div>
          <div class="mt-2.5 flex items-center justify-between gap-3 text-[12.5px] text-muted">
            <span><span class="font-semibold text-highlighted tabular-nums">{{ p.task_done }}</span> of <span class="font-semibold text-highlighted tabular-nums">{{ p.task_total }}</span> tasks done</span>
            <span v-if="p.target_launch_date">Target launch · <span class="font-semibold text-highlighted">{{ shortDate(p.target_launch_date) }}</span></span>
            <span v-else>Launch date · <span class="font-semibold text-highlighted">TBD</span></span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Recently shared files + latest activity -->
    <section
      v-if="!pending"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <div class="rounded-card bg-default p-5 pb-2 ring ring-default">
        <div class="flex items-center justify-between pb-3">
          <p class="eyebrow">
            Recently Shared
          </p>
          <NuxtLink
            to="/files"
            class="text-[12.5px] font-medium text-primary hover:underline"
          >
            All files
          </NuxtLink>
        </div>
        <p
          v-if="!files.length"
          class="border-t border-default py-4 text-[13px] text-muted"
        >
          Files we share with you will show up here.
        </p>
        <NuxtLink
          v-for="f in files"
          :key="f.id"
          to="/files"
          class="flex items-center gap-3 border-t border-default py-3"
        >
          <span class="inline-flex size-9 flex-none items-center justify-center rounded-[9px] bg-mist text-primary">
            <UIcon
              :name="fileIcon(f)"
              class="size-4.5"
            />
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13.5px] font-medium text-highlighted">
              {{ f.name }}
            </div>
            <div class="text-[12px] text-muted">
              {{ formatBytes(f.size_bytes) }}
            </div>
          </div>
          <span class="text-[12px] text-muted tabular-nums">{{ timeAgo(f.created_at) }}</span>
        </NuxtLink>
      </div>

      <div class="rounded-card bg-default p-5 pb-2 ring ring-default">
        <div class="flex items-center justify-between pb-3">
          <p class="eyebrow">
            Latest Activity
          </p>
        </div>
        <p
          v-if="!activity.length"
          class="border-t border-default py-4 text-[13px] text-muted"
        >
          You're all caught up.
        </p>
        <div
          v-for="n in activity"
          :key="n.id"
          class="flex items-center gap-3 border-t border-default py-3"
        >
          <span class="inline-flex size-9 flex-none items-center justify-center rounded-[9px] bg-mist text-primary">
            <UIcon
              :name="n.icon || 'i-lucide-bell'"
              class="size-4.5"
            />
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13.5px] font-medium text-highlighted">
              {{ n.title }}
            </div>
            <div
              v-if="n.body"
              class="truncate text-[12px] text-muted"
            >
              {{ n.body }}
            </div>
          </div>
          <span class="text-[12px] text-muted tabular-nums">{{ timeAgo(n.created_at) }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
