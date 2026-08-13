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

// ---- the library tabs ----
type TabKey = 'all' | 'deliverable' | 'brand' | 'contract' | 'yours'
const TABS: { key: TabKey, label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'deliverable', label: 'Deliverables' },
  { key: 'brand', label: 'Brand' },
  { key: 'contract', label: 'Documents' },
  { key: 'yours', label: 'Yours' }
]
const activeTab = ref<TabKey>('all')

function tabOf(f: FileRow): TabKey {
  return f.uploaded_by === 'client' ? 'yours' : (f.category as TabKey)
}
function countFor(key: TabKey) {
  return key === 'all' ? files.value.length : files.value.filter(f => tabOf(f) === key).length
}
const visibleTabs = computed(() => TABS.filter(t => countFor(t.key) > 0 || t.key === 'all'))
const shown = computed(() => activeTab.value === 'all'
  ? files.value
  : files.value.filter(f => tabOf(f) === activeTab.value))

// Images render as thumbnails; anything that fails to load (missing file,
// corrupt upload) falls back to the type glyph instead of a broken image.
const brokenPreviews = ref(new Set<number>())
function isImage(f: FileRow) {
  return !!f.mime?.startsWith('image/') && !brokenPreviews.value.has(f.id)
}
function onPreviewError(f: FileRow) {
  brokenPreviews.value = new Set([...brokenPreviews.value, f.id])
}
function glyph(f: FileRow) {
  if (f.mime?.includes('zip')) return 'i-lucide-archive'
  return 'i-lucide-file-text'
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
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow text-primary">
          Your Files
        </p>
        <h1 class="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-tight text-highlighted">
          Files
        </h1>
      </div>
      <div class="flex items-center gap-2.5">
        <input
          ref="fileInput"
          type="file"
          multiple
          class="hidden"
          @change="onFilesPicked"
        >
        <USelect
          v-model="uploadProject"
          :items="projectItems"
          placeholder="No project"
          class="w-48"
        />
        <UButton
          color="primary"
          icon="i-lucide-upload"
          :loading="uploading"
          @click="() => fileInput?.click()"
        >
          Upload Files
        </UButton>
      </div>
    </div>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <div
      v-else-if="!files.length"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-semibold text-highlighted">
        No files yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        Files we share with you will appear here — and you can send us yours (PDF, images, docs, or zip, up to 10 MB each).
      </p>
    </div>

    <template v-else>
      <!-- filter tabs -->
      <div class="flex items-baseline justify-between gap-4 border-b border-default">
        <div class="flex gap-0.5">
          <button
            v-for="t in visibleTabs"
            :key="t.key"
            class="-mb-px cursor-pointer border-b-2 px-3 py-2 text-[13px] transition-colors"
            :class="activeTab === t.key
              ? 'border-citrine font-semibold text-highlighted'
              : 'border-transparent font-medium text-muted hover:text-highlighted'"
            @click="activeTab = t.key"
          >
            {{ t.label }}
            <span class="ml-1 text-[11px] tabular-nums text-muted">{{ countFor(t.key) }}</span>
          </button>
        </div>
        <span class="hidden text-[12px] text-muted sm:block">PDF, images, docs, or zip — up to 10 MB each</span>
      </div>

      <!-- the library -->
      <div class="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
        <a
          v-for="f in shown"
          :key="f.id"
          :href="resolveUrl(f.path)"
          target="_blank"
          rel="noopener"
          class="flex flex-col overflow-hidden rounded-card bg-default ring ring-default transition-colors hover:ring-primary"
        >
          <span class="flex h-28 items-center justify-center overflow-hidden border-b border-default bg-mist">
            <img
              v-if="isImage(f)"
              :src="resolveUrl(f.path)"
              :alt="f.name"
              loading="lazy"
              class="size-full object-cover"
              @error="onPreviewError(f)"
            >
            <UIcon
              v-else
              :name="glyph(f)"
              class="size-8 text-muted"
            />
          </span>
          <span class="flex-1 px-3.5 pb-3 pt-2.5">
            <span class="block truncate text-[12.5px] font-semibold text-highlighted">{{ f.name }}</span>
            <span class="mt-0.5 block truncate text-[11px] text-muted">
              {{ shortDate(f.created_at) }}<template v-if="f.size_bytes"> · {{ formatBytes(f.size_bytes) }}</template><template v-if="f.project_name"> · {{ f.project_name }}</template>
            </span>
          </span>
        </a>
      </div>
    </template>
  </div>
</template>
