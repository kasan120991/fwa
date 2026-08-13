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
  unknown: { label: 'Checking', class: 'bg-mist text-muted' }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <p class="eyebrow text-primary">
        Your Sites
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-tight text-highlighted">
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
      <h3 class="font-display text-lg font-semibold text-highlighted">
        No websites yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Sites we build and host for you will appear here with live stats.
      </p>
    </div>

    <!-- status table — one row per site -->
    <div v-else>
      <div class="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-6 border-b border-default pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
        <span>Site</span>
        <span>Status</span>
        <span class="text-right">Visitors · 30d</span>
        <span class="text-right">Uptime</span>
        <span />
      </div>
      <NuxtLink
        v-for="s in sites"
        :key="s.id"
        :to="`/websites/${s.id}`"
        class="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-6 border-b border-default py-3.5 transition-colors last:border-b-0 hover:bg-mist"
      >
        <span class="min-w-0">
          <span class="block truncate text-[14px] font-medium text-highlighted">{{ s.name }}</span>
          <span class="block truncate text-[12px] text-muted">{{ s.domain }}</span>
        </span>
        <span
          class="rounded-chip px-2.5 py-1 text-[11px] font-semibold"
          :class="(HEALTH[s.health_state] || HEALTH.unknown)!.class"
        >{{ (HEALTH[s.health_state] || HEALTH.unknown)!.label }}</span>
        <span class="text-right text-[14px] font-semibold tabular-nums text-highlighted">
          {{ (s.visitors_30d ?? 0).toLocaleString() }}
          <span
            v-if="s.delta_pct != null"
            class="text-[11.5px] font-semibold"
            :class="s.delta_pct >= 0 ? 'text-success' : 'text-warning'"
          >{{ s.delta_pct >= 0 ? '+' : '' }}{{ s.delta_pct }}%</span>
        </span>
        <span class="text-right text-[13.5px] font-semibold tabular-nums text-highlighted">
          {{ s.uptime_pct != null ? Number(s.uptime_pct).toFixed(2) + '%' : '—' }}
        </span>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-4 text-muted"
        />
      </NuxtLink>
    </div>
  </div>
</template>
