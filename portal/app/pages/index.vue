<script setup lang="ts">
useHead({ title: 'Home · Francis Web Agency' })
const api = useApi()

interface Overview {
  client: { id: number, name: string, company: string | null } | null
  active_projects: number
  outstanding_balance: number
  open_tickets: number
}
const overview = ref<Overview | null>(null)
const pending = ref(true)

onMounted(async () => {
  try {
    const { data } = await api<{ data: Overview }>('/portal/overview')
    overview.value = data
  } finally {
    pending.value = false
  }
})

const greetName = computed(() => overview.value?.client?.company || overview.value?.client?.name || 'there')
const stats = computed(() => [
  { label: 'Active projects', value: String(overview.value?.active_projects ?? 0), icon: 'i-lucide-folder-kanban', to: '/projects' },
  { label: 'Outstanding balance', value: formatMoney(overview.value?.outstanding_balance ?? 0), icon: 'i-lucide-receipt-text', to: '/invoices' },
  { label: 'Open tickets', value: String(overview.value?.open_tickets ?? 0), icon: 'i-lucide-life-buoy', to: '/support' }
])
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <p class="eyebrow text-primary">
        Client portal
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-medium leading-tight tracking-tight text-highlighted">
        Welcome, {{ greetName }}
      </h1>
      <p class="mt-1.5 text-[0.9375rem] text-muted">
        Here's where your projects, invoices, and progress live.
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <NuxtLink
        v-for="s in stats"
        :key="s.label"
        :to="s.to"
        class="flex items-center gap-4 rounded-card bg-default p-5 ring ring-default transition-shadow hover:ring-primary/40"
      >
        <span class="inline-flex size-10 flex-none items-center justify-center rounded-[10px] bg-mist text-primary">
          <UIcon
            :name="s.icon"
            class="size-5"
          />
        </span>
        <div class="min-w-0">
          <div class="text-[12.5px] text-muted">
            {{ s.label }}
          </div>
          <div class="font-display text-[1.5rem] font-medium tabular-nums text-highlighted">
            {{ pending ? '—' : s.value }}
          </div>
        </div>
      </NuxtLink>
    </div>

    <NuxtLink
      to="/projects"
      class="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary"
    >
      View your projects
      <UIcon
        name="i-lucide-arrow-right"
        class="size-4"
      />
    </NuxtLink>
  </div>
</template>
