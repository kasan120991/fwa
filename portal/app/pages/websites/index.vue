<script setup lang="ts">
useHead({ title: 'Websites · Francis Web Agency' })
const api = useApi()

interface Site {
  id: number
  name: string
  domain: string
  url: string | null
  health_state: 'up' | 'degraded' | 'down' | 'unknown'
  uptime_pct: number | null
  visitors_30d?: number
  delta_pct?: number | null
}
const sites = ref<Site[]>([])
const pending = ref(true)

onMounted(async () => {
  try {
    const { data } = await api<{ data: Site[] }>('/portal/websites')
    sites.value = data
  } finally {
    pending.value = false
  }
})

const HEALTH: Record<string, { label: string, class: string }> = {
  up: { label: 'Online', class: 'bg-success/10 text-success' },
  degraded: { label: 'Slow', class: 'bg-warning/10 text-warning' },
  down: { label: 'Down', class: 'bg-error/10 text-error' },
  unknown: { label: 'Checking', class: 'bg-muted text-muted' }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <p class="eyebrow text-primary">
        Your sites
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-medium leading-tight tracking-tight text-highlighted">
        Websites
      </h1>
    </div>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="!sites.length"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-medium text-highlighted">
        No websites yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Sites we build and host for you will appear here with live stats.
      </p>
    </div>

    <div
      v-else
      class="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <NuxtLink
        v-for="s in sites"
        :key="s.id"
        :to="`/websites/${s.id}`"
        class="flex flex-col gap-3 rounded-card bg-default p-5 ring ring-default transition-shadow hover:ring-primary/40"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="font-display text-[1.05rem] font-medium text-highlighted">
              {{ s.name }}
            </h2>
            <p class="mt-0.5 truncate text-[12.5px] text-muted">
              {{ s.domain }}
            </p>
          </div>
          <span
            class="whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
            :class="(HEALTH[s.health_state] || HEALTH.unknown)!.class"
          >{{ (HEALTH[s.health_state] || HEALTH.unknown)!.label }}</span>
        </div>
        <div class="flex items-end justify-between gap-3">
          <div>
            <div class="text-[12px] text-muted">
              Visitors · 30 days
            </div>
            <div class="font-display text-[1.35rem] font-medium tabular-nums text-highlighted">
              {{ (s.visitors_30d ?? 0).toLocaleString() }}
              <span
                v-if="s.delta_pct != null"
                class="text-[12px] font-normal"
                :class="s.delta_pct >= 0 ? 'text-success' : 'text-warning'"
              >{{ s.delta_pct >= 0 ? '+' : '' }}{{ s.delta_pct }}%</span>
            </div>
          </div>
          <div
            v-if="s.uptime_pct != null"
            class="text-right"
          >
            <div class="text-[12px] text-muted">
              Uptime
            </div>
            <div class="text-[14px] font-semibold tabular-nums text-highlighted">
              {{ Number(s.uptime_pct).toFixed(2) }}%
            </div>
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
