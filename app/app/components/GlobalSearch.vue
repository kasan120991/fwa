<script setup lang="ts">
// Global ⌘K command palette. Static Navigation + Actions groups (filtered
// locally by the palette's Fuse) plus live record groups from GET /api/search
// (server-filtered, so ignoreFilter). Records navigate via `to`; create actions
// emit `action` so the parent (AppTopBar) opens the matching form modal.
interface Hit { id: number, title: string, subtitle: string, link: string }
interface Results { clients: Hit[], projects: Hit[], invoices: Hit[], expenses: Hit[], tickets: Hit[] }

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean], 'action': [string] }>()

const api = useApi()

const term = ref('')
const loading = ref(false)
const emptyResults = (): Results => ({ clients: [], projects: [], invoices: [], expenses: [], tickets: [] })
const results = ref<Results>(emptyResults())

// Static launcher entries (shown by default, matched by the palette's own Fuse).
const NAV = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'AI Receptionist', icon: 'i-lucide-phone-call', to: '/receptionist' },
  { label: 'Leads', icon: 'i-lucide-user-plus', to: '/leads' },
  { label: 'Clients', icon: 'i-lucide-users', to: '/clients' },
  { label: 'Projects', icon: 'i-lucide-folder-kanban', to: '/projects' },
  { label: 'Tasks', icon: 'i-lucide-list-checks', to: '/tasks' },
  { label: 'Agreements', icon: 'i-lucide-file-signature', to: '/agreements' },
  { label: 'Invoices', icon: 'i-lucide-receipt-text', to: '/invoices' },
  { label: 'Payments', icon: 'i-lucide-credit-card', to: '/payments' },
  { label: 'Expenses', icon: 'i-lucide-wallet', to: '/expenses' },
  { label: 'Websites', icon: 'i-lucide-globe', to: '/websites' },
  { label: 'Support Tickets', icon: 'i-lucide-life-buoy', to: '/support' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
]
const ACTIONS = [
  { label: 'New Lead', icon: 'i-lucide-user-plus', to: '/leads/new' },
  { label: 'New Client', icon: 'i-lucide-building-2', to: '/clients/new' },
  { label: 'New Project', icon: 'i-lucide-folder-plus', onSelect: () => emit('action', 'project') },
  { label: 'New Ticket', icon: 'i-lucide-life-buoy', onSelect: () => emit('action', 'ticket') },
  { label: 'New Invoice', icon: 'i-lucide-receipt-text', onSelect: () => emit('action', 'invoice') },
  { label: 'New Expense', icon: 'i-lucide-wallet', onSelect: () => emit('action', 'expense') }
]

const RECORD_META = [
  { key: 'clients' as const, label: 'Clients', icon: 'i-lucide-users' },
  { key: 'projects' as const, label: 'Projects', icon: 'i-lucide-folder-kanban' },
  { key: 'invoices' as const, label: 'Invoices', icon: 'i-lucide-receipt-text' },
  { key: 'expenses' as const, label: 'Expenses', icon: 'i-lucide-wallet' },
  { key: 'tickets' as const, label: 'Tickets', icon: 'i-lucide-life-buoy' }
]

const groups = computed(() => {
  const g: Array<Record<string, unknown>> = [
    { id: 'navigation', label: 'Go to', items: NAV },
    { id: 'actions', label: 'Create', items: ACTIONS }
  ]
  for (const m of RECORD_META) {
    const hits = results.value[m.key]
    if (hits.length) {
      g.push({
        id: m.key,
        label: m.label,
        ignoreFilter: true,
        items: hits.map(h => ({ label: h.title, suffix: h.subtitle, icon: m.icon, to: h.link }))
      })
    }
  }
  return g
})

// Debounced server search on the typed term (≥2 chars).
let timer: ReturnType<typeof setTimeout> | undefined
watch(term, (q) => {
  clearTimeout(timer)
  const query = q.trim()
  if (query.length < 2) {
    results.value = emptyResults()
    loading.value = false
    return
  }
  loading.value = true
  timer = setTimeout(async () => {
    try {
      const { data } = await api<{ data: Results }>('/search', { query: { q: query } })
      results.value = data
    } catch { /* keep prior results on transient error */ } finally {
      loading.value = false
    }
  }, 200)
})

// Reset on every open so stale results/term never flash.
watch(() => props.open, (o) => {
  if (!o) return
  term.value = ''
  results.value = emptyResults()
})

function onSelect() {
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="open"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <UCommandPalette
        v-model:search-term="term"
        :groups="groups"
        :loading="loading"
        placeholder="Search clients, projects, invoices…"
        :fuse="{ resultLimit: 40 }"
        class="h-[28rem]"
        @update:model-value="onSelect"
      >
        <template #empty>
          <div class="flex flex-col items-center px-6 py-10 text-center">
            <span class="mb-3 inline-flex size-11 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
              name="i-lucide-search-x"
              class="size-5"
            /></span>
            <p class="text-sm text-muted">
              {{ term.trim().length >= 2 ? `No matches for “${term.trim()}”` : 'Type to search records, or jump to a page.' }}
            </p>
          </div>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
