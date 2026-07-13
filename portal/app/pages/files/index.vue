<script setup lang="ts">
useHead({ title: 'Files · Francis Web Agency' })
const api = useApi()
const { resolveUrl } = useUploads()

interface FileRow {
  id: number
  category: 'brand' | 'contract' | 'deliverable'
  path: string
  name: string
  mime: string | null
  size_bytes: number | null
  project_name?: string | null
  created_at: string | null
}
const files = ref<FileRow[]>([])
const pending = ref(true)

onMounted(async () => {
  try {
    const { data } = await api<{ data: FileRow[] }>('/portal/files')
    files.value = data
  } finally {
    pending.value = false
  }
})

const CATEGORY_META: Record<string, { label: string, icon: string }> = {
  deliverable: { label: 'Deliverables', icon: 'i-lucide-package' },
  brand: { label: 'Brand assets', icon: 'i-lucide-palette' },
  contract: { label: 'Contracts & documents', icon: 'i-lucide-file-text' }
}
const groups = computed(() => ['deliverable', 'brand', 'contract']
  .map(c => ({ key: c, meta: CATEGORY_META[c]!, items: files.value.filter(f => f.category === c) }))
  .filter(g => g.items.length))

function formatSize(bytes?: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <p class="eyebrow text-primary">
        Your files
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-medium leading-tight tracking-tight text-highlighted">
        Files
      </h1>
      <p class="mt-1.5 text-[0.9375rem] text-muted">
        Deliverables, brand assets, and documents we've shared with you.
      </p>
    </div>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="!groups.length"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-medium text-highlighted">
        No files yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Files we share with you will appear here for download.
      </p>
    </div>

    <div
      v-for="g in groups"
      v-else
      :key="g.key"
      class="overflow-hidden rounded-card bg-default ring ring-default"
    >
      <div class="flex items-center gap-2 border-b border-default px-5 py-3.5">
        <UIcon
          :name="g.meta.icon"
          class="size-4 text-primary"
        />
        <span class="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">{{ g.meta.label }}</span>
        <span class="text-[12px] text-muted tabular-nums">{{ g.items.length }}</span>
      </div>
      <a
        v-for="f in g.items"
        :key="f.id"
        :href="resolveUrl(f.path)"
        target="_blank"
        rel="noopener"
        class="flex items-center gap-4 border-b border-default px-5 py-3.5 transition-colors last:border-0 hover:bg-muted/50"
      >
        <UIcon
          name="i-lucide-file"
          class="size-4.5 flex-none text-muted"
        />
        <div class="min-w-0 flex-1">
          <div class="truncate text-[13.5px] font-medium text-highlighted">
            {{ f.name }}
          </div>
          <div class="text-[12px] text-muted">
            <span v-if="f.project_name">{{ f.project_name }} · </span>{{ shortDate(f.created_at) }}
          </div>
        </div>
        <span class="text-[12px] text-muted tabular-nums">{{ formatSize(f.size_bytes) }}</span>
        <UIcon
          name="i-lucide-download"
          class="size-4 flex-none text-primary"
        />
      </a>
    </div>
  </div>
</template>
