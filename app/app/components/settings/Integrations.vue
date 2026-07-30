<script setup lang="ts">
// Settings → Integrations: read-only connection status per integration. Keys are
// managed in the server environment; this just reflects what's configured.
const api = useApi()

interface Integration {
  id: string
  name: string
  description: string
  connected: boolean
  detail?: string | null
  tone?: 'success' | 'warning'
}
const items = ref<Integration[]>([])
const pending = ref(true)

onMounted(async () => {
  try {
    const { data } = await api<{ data: Integration[] }>('/settings/integrations')
    items.value = data
  } finally {
    pending.value = false
  }
})

function chip(i: Integration) {
  if (!i.connected) return { label: 'Not Connected', class: 'bg-elevated text-muted' }
  if (i.tone === 'warning') return { label: i.detail || 'Connected', class: 'bg-warning/10 text-warning' }
  return { label: i.detail || 'Connected', class: 'bg-success/10 text-success' }
}
</script>

<template>
  <section class="rounded-card bg-default p-6 ring ring-default">
    <div class="mb-5">
      <h2 class="text-base font-semibold text-highlighted">
        Connected Services
      </h2>
      <p class="mt-1 text-[13.5px] text-muted">
        The tools that power billing, documents, analytics, and the receptionist. Keys are set on the server.
      </p>
    </div>

    <div
      v-if="pending"
      class="py-10 text-center text-sm text-muted"
    >
      Loading…
    </div>

    <div
      v-else
      class="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      <div
        v-for="i in items"
        :key="i.id"
        class="flex items-start justify-between gap-3 rounded-[14px] border border-default p-4"
      >
        <div class="min-w-0">
          <div class="text-[14.5px] font-semibold text-highlighted">
            {{ i.name }}
          </div>
          <div class="mt-0.5 text-[12.5px] text-muted">
            {{ i.description }}
          </div>
        </div>
        <span
          class="inline-flex flex-none items-center gap-1.5 rounded-chip px-2.5 py-1 text-[11px] font-semibold"
          :class="chip(i).class"
        >
          <span class="size-1.5 rounded-full bg-current" />{{ chip(i).label }}
        </span>
      </div>
    </div>
  </section>
</template>
