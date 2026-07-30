<script setup lang="ts">
useHead({ title: 'Files · Francis Web Agency' })
const api = useApi()
const socket = useSocket()
const toast = useToast()
const { upload, resolveUrl } = useUploads()

interface FileRow {
  id: number
  category: 'brand' | 'contract' | 'deliverable' | 'other'
  uploaded_by: 'admin' | 'client'
  path: string
  name: string
  mime: string | null
  size_bytes: number | null
  project_name?: string | null
  created_at: string | null
}
const files = ref<FileRow[]>([])
const pending = ref(true)
const projects = ref<{ id: number, name: string }[]>([])

async function load() {
  const { data } = await api<{ data: FileRow[] }>('/portal/files')
  files.value = data
}
onMounted(async () => {
  try {
    await load()
    const { data } = await api<{ data: { id: number, name: string }[] }>('/portal/projects')
    projects.value = data.map(p => ({ id: p.id, name: p.name }))
  } finally {
    pending.value = false
  }
  socket.on('file:changed', load)
})
onBeforeUnmount(() => socket.off('file:changed', load))

const CATEGORY_META: Record<string, { label: string, icon: string }> = {
  deliverable: { label: 'Deliverables', icon: 'i-lucide-package' },
  brand: { label: 'Brand assets', icon: 'i-lucide-palette' },
  contract: { label: 'Contracts & documents', icon: 'i-lucide-file-text' },
  yours: { label: 'Your uploads', icon: 'i-lucide-upload' }
}
const groups = computed(() => {
  const g = ['deliverable', 'brand', 'contract']
    .map(c => ({ key: c, meta: CATEGORY_META[c]!, items: files.value.filter(f => f.uploaded_by !== 'client' && f.category === c) }))
  g.push({ key: 'yours', meta: CATEGORY_META.yours!, items: files.value.filter(f => f.uploaded_by === 'client') })
  return g.filter(x => x.items.length)
})

function formatSize(bytes?: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---- upload ----
const fileInput = ref<HTMLInputElement | null>(null)
const uploadProject = ref<number | null>(null)
const uploading = ref(false)
const projectItems = computed(() => [{ label: 'No project', value: null as number | null }, ...projects.value.map(p => ({ label: p.name, value: p.id }))])

async function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  if (!picked.length) return
  uploading.value = true
  try {
    for (const file of picked) {
      const res = await upload(file)
      await api('/portal/files', {
        method: 'POST',
        body: { path: res.path, name: res.name, mime: res.mime, size: res.size, project_id: uploadProject.value }
      })
    }
    toast.add({ title: picked.length > 1 ? `${picked.length} files uploaded` : 'File uploaded', color: 'success' })
    await load()
  } catch (err: unknown) {
    const e2 = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Upload failed', description: e2?.data?.error?.message || 'Check the file type and size (max 10 MB).', color: 'error' })
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <p class="eyebrow text-primary">
        Your files
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-tight text-highlighted">
        Files
      </h1>
      <p class="mt-1.5 text-[0.9375rem] text-muted">
        Deliverables, brand assets, and documents we've shared with you.
      </p>
    </div>

    <!-- upload -->
    <div class="flex flex-wrap items-center gap-3 rounded-card bg-default p-4 ring ring-default">
      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        @change="onFilesPicked"
      >
      <UButton
        color="primary"
        icon="i-lucide-upload"
        :loading="uploading"
        @click="() => fileInput?.click()"
      >
        Upload files
      </UButton>
      <USelect
        v-model="uploadProject"
        :items="projectItems"
        placeholder="No project"
        class="w-52"
      />
      <span class="text-[12.5px] text-muted">PDF, images, docs, or zip — up to 10 MB each.</span>
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
      <h3 class="font-display text-lg font-semibold text-highlighted">
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
        <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{{ g.meta.label }}</span>
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
