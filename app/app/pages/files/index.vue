<script setup lang="ts">
useHead({ title: 'Files · Francis Web Agency' })

// The Workspace › Files library. Files are first-class records (GET /api/files)
// that reuse the shared upload store: bytes go to POST /api/uploads first, then
// this page records the metadata against a client + category via POST /api/files.
type Category = 'brand' | 'contract' | 'deliverable' | 'other'

interface ApiFile {
  id: number
  client_id: number | null
  project_id: number | null
  category: Category
  path: string
  name: string
  mime: string | null
  size_bytes: number | string | null
  created_at: string
  client_name: string | null
  client_company: string | null
  project_name: string | null
  uploaded_by_name: string | null
}

interface FileRow {
  id: number
  name: string
  ext: string
  path: string
  category: Category
  size: number | null
  client: string
  clientId: number | null
  meta: string
  createdAt: string
}

const api = useApi()
const toast = useToast()
const { upload, resolveUrl } = useUploads()

const files = ref<FileRow[]>([])
const pending = ref(true)

const CATEGORY_META: Record<Category, { label: string, status: 'info' | 'warning' | 'success' | 'neutral' }> = {
  brand: { label: 'Brand & Design', status: 'info' },
  contract: { label: 'Contracts', status: 'warning' },
  deliverable: { label: 'Deliverables', status: 'success' },
  other: { label: 'Other', status: 'neutral' }
}

// Extension → tint for the file-type badge (mirrors the Client-detail Files tab).
const EXT_CLASS: Record<string, string> = {
  PDF: 'text-error', FIG: 'text-info', ZIP: 'text-warning', XLSX: 'text-success',
  XLS: 'text-success', DOC: 'text-info', DOCX: 'text-info', PNG: 'text-primary',
  JPG: 'text-primary', JPEG: 'text-primary', SVG: 'text-primary', WEBP: 'text-primary'
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot === name.length - 1) return 'FILE'
  return name.slice(dot + 1).toUpperCase().slice(0, 4)
}

function mapFile(f: ApiFile): FileRow {
  const who = f.uploaded_by_name || 'System'
  const size = f.size_bytes == null ? null : Number(f.size_bytes)
  return {
    id: f.id,
    name: f.name,
    ext: extOf(f.name),
    path: f.path,
    category: f.category,
    size: Number.isFinite(size as number) ? size : null,
    client: f.client_company || f.client_name || '',
    clientId: f.client_id,
    meta: `Uploaded ${shortDate(f.created_at)} · ${who}`,
    createdAt: f.created_at
  }
}

async function load() {
  pending.value = true
  try {
    const { data } = await api<{ data: ApiFile[] }>('/files')
    files.value = data.map(mapFile)
  } catch {
    toast.add({ title: 'Could not load files', color: 'error' })
  } finally {
    pending.value = false
  }
}
onMounted(load)

// Live refresh when a file is uploaded/renamed/deleted in another tab.
let socket: ReturnType<typeof useSocket> | null = null
onMounted(() => {
  socket = useSocket()
  socket.on('file:changed', load)
})
onBeforeUnmount(() => {
  socket?.off('file:changed', load)
})

// ---- filtering ----
type Tab = 'all' | Category
const tab = ref<Tab>('all')
const search = ref('')
const clientFilter = ref<number | 'all'>('all')

const counts = computed(() => ({
  all: files.value.length,
  brand: files.value.filter(f => f.category === 'brand').length,
  contract: files.value.filter(f => f.category === 'contract').length,
  deliverable: files.value.filter(f => f.category === 'deliverable').length,
  other: files.value.filter(f => f.category === 'other').length
}))

const tabs = computed(() => ([
  { key: 'all' as const, label: 'All', count: counts.value.all },
  { key: 'brand' as const, label: 'Brand & Design', count: counts.value.brand },
  { key: 'contract' as const, label: 'Contracts', count: counts.value.contract },
  { key: 'deliverable' as const, label: 'Deliverables', count: counts.value.deliverable },
  { key: 'other' as const, label: 'Other', count: counts.value.other }
]))

function setClientFilter(v: number | 'all') {
  clientFilter.value = v
}

const clientFilterItems = computed(() => {
  const seen = new Map<number, string>()
  for (const f of files.value) if (f.clientId != null && f.client) seen.set(f.clientId, f.client)
  const items = [[{ label: 'All Clients', onSelect: () => setClientFilter('all') }]]
  const list = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ label: name, onSelect: () => setClientFilter(id) }))
  if (list.length) items.push(list)
  return items
})

const visibleRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = tab.value === 'all' ? files.value.slice() : files.value.filter(f => f.category === tab.value)
  if (clientFilter.value !== 'all') rows = rows.filter(f => f.clientId === clientFilter.value)
  if (q) rows = rows.filter(f => `${f.name} ${f.client}`.toLowerCase().includes(q))
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
})

const totalSize = computed(() => files.value.reduce((sum, f) => sum + (f.size || 0), 0))

// ---- upload ----
const uploadOpen = ref(false)
const uploading = ref(false)
const pendingFiles = ref<File[]>([])
const uploadClientId = ref<number | undefined>(undefined)
const uploadCategory = ref<Category>('other')
const fileInput = ref<HTMLInputElement | null>(null)

const clientItems = ref<{ label: string, value: number }[]>([])
const categoryItems = (Object.keys(CATEGORY_META) as Category[]).map(c => ({ label: CATEGORY_META[c].label, value: c }))

async function loadClients() {
  if (clientItems.value.length) return
  try {
    const { data } = await api<{ data: { id: number, company: string | null, name: string }[] }>('/clients', { query: { limit: 200 } })
    clientItems.value = data.map(c => ({ label: c.company || c.name, value: c.id }))
  } catch {
    toast.add({ title: 'Could not load clients', color: 'error' })
  }
}

function openUpload() {
  pendingFiles.value = []
  uploadClientId.value = undefined
  uploadCategory.value = 'other'
  uploadOpen.value = true
  loadClients()
}
function pickFiles() {
  fileInput.value?.click()
}
function onFilesChosen(e: Event) {
  const input = e.target as HTMLInputElement
  pendingFiles.value = [...pendingFiles.value, ...Array.from(input.files ?? [])]
  input.value = ''
}
function removePending(i: number) {
  pendingFiles.value = pendingFiles.value.filter((_, idx) => idx !== i)
}

async function submitUpload() {
  if (!pendingFiles.value.length || uploading.value) return
  uploading.value = true
  try {
    for (const file of pendingFiles.value) {
      const res = await upload(file)
      await api('/files', {
        method: 'POST',
        body: {
          path: res.path,
          name: res.name,
          mime: res.mime,
          size: res.size,
          client_id: uploadClientId.value ?? null,
          category: uploadCategory.value
        }
      })
    }
    toast.add({ title: `Uploaded ${pendingFiles.value.length} file${pendingFiles.value.length === 1 ? '' : 's'}`, color: 'success' })
    uploadOpen.value = false
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not upload that file', description: e?.data?.error?.message, color: 'error' })
  } finally {
    uploading.value = false
  }
}

// ---- delete ----
const deleteTarget = ref<FileRow | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  try {
    await api(`/files/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'File deleted', color: 'success' })
    deleteTarget.value = null
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not delete that file', description: e?.data?.error?.message, color: 'error' })
  } finally {
    deleting.value = false
  }
}

function rowMenuItems(f: FileRow) {
  return [
    [{ label: 'Download', icon: 'i-lucide-download', onSelect: () => { window.open(resolveUrl(f.path), '_blank') } }],
    [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = f } }]
  ]
}
</script>

<template>
  <!-- page header -->
  <PageHeader
    icon="i-lucide-folder"
    title="Files"
    :count="counts.all"
    subtitle="Brand assets, contracts, and deliverables across your clients."
  >
    <template #actions>
      <UButton
        icon="i-lucide-upload"
        color="primary"
        @click="openUpload"
      >
        Upload
      </UButton>
    </template>
  </PageHeader>

  <!-- stats -->
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
    <StatCard
      label="Total Files"
      :value="counts.all"
      :delta="null"
    />
    <StatCard
      label="Storage Used"
      :value="formatBytes(totalSize)"
      :delta="null"
    />
    <StatCard
      label="Contracts"
      :value="counts.contract"
      :delta="null"
    />
    <StatCard
      label="Deliverables"
      :value="counts.deliverable"
      :delta="null"
    />
  </div>

  <!-- controls -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors"
        :class="tab === t.key ? 'border-primary bg-mist font-semibold text-primary' : 'border-default bg-default font-medium text-muted hover:text-highlighted'"
        @click="tab = t.key"
      >
        {{ t.label }}
        <span
          class="rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
          :class="tab === t.key ? 'bg-default text-primary' : 'bg-muted text-muted'"
        >{{ t.count }}</span>
      </button>
    </div>

    <div class="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search files, clients…"
        class="w-full sm:w-[250px]"
        :ui="{ base: 'rounded-full' }"
      />
      <UDropdownMenu :items="clientFilterItems">
        <UButton
          icon="i-lucide-building-2"
          color="neutral"
          variant="outline"
          class="rounded-full"
        >
          Client
        </UButton>
      </UDropdownMenu>
    </div>
  </div>

  <!-- table card -->
  <div class="overflow-hidden rounded-card bg-default ring ring-default">
    <div
      v-if="pending"
      class="px-6 py-16 text-center text-sm text-muted"
    >
      Loading files…
    </div>

    <template v-else-if="visibleRows.length > 0">
      <!-- mobile cards -->
      <ul class="divide-y divide-default sm:hidden">
        <li
          v-for="row in visibleRows"
          :key="row.id"
          class="flex items-center gap-3 px-4 py-3"
        >
          <span
            class="inline-flex size-[38px] flex-none items-center justify-center rounded-[9px] bg-muted font-mono text-[10px] font-semibold"
            :class="EXT_CLASS[row.ext] ?? 'text-muted'"
          >{{ row.ext }}</span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium text-highlighted">
              {{ row.name }}
            </div>
            <div class="mt-0.5 truncate text-[12.5px] text-muted">
              {{ row.client || 'No client' }} · {{ formatBytes(row.size) }}
            </div>
          </div>
          <UDropdownMenu :items="rowMenuItems(row)">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="File actions"
            />
          </UDropdownMenu>
        </li>
      </ul>

      <!-- table (sm+) -->
      <div class="hidden overflow-x-auto sm:block">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-default">
              <th class="px-4 py-3 pl-[18px] text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                File
              </th>
              <th class="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                Category
              </th>
              <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">
                Client
              </th>
              <th class="hidden px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted lg:table-cell">
                Uploaded
              </th>
              <th class="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-muted">
                Size
              </th>
              <th class="w-[52px] px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visibleRows"
              :key="row.id"
              class="border-b border-default transition-colors last:border-b-0 hover:bg-muted"
            >
              <td class="px-4 py-3 pl-[18px]">
                <div class="flex items-center gap-3">
                  <span
                    class="inline-flex size-[38px] flex-none items-center justify-center rounded-[9px] bg-muted font-mono text-[10px] font-semibold"
                    :class="EXT_CLASS[row.ext] ?? 'text-muted'"
                  >{{ row.ext }}</span>
                  <a
                    :href="resolveUrl(row.path)"
                    target="_blank"
                    rel="noopener"
                    class="min-w-0 truncate text-sm font-medium text-highlighted hover:text-primary hover:underline"
                  >{{ row.name }}</a>
                </div>
              </td>
              <td class="px-4 py-3">
                <StatusChip :status="CATEGORY_META[row.category].status">
                  {{ CATEGORY_META[row.category].label }}
                </StatusChip>
              </td>
              <td
                class="hidden whitespace-nowrap px-4 py-3 text-sm lg:table-cell"
                :class="row.client ? 'text-default' : 'text-muted'"
              >
                {{ row.client || '—' }}
              </td>
              <td class="hidden whitespace-nowrap px-4 py-3 text-[13px] text-muted lg:table-cell">
                {{ row.meta }}
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-right text-sm text-muted tabular-nums">
                {{ formatBytes(row.size) }}
              </td>
              <td class="w-[52px] px-4 py-3 text-right">
                <UDropdownMenu :items="rowMenuItems(row)">
                  <UButton
                    icon="i-lucide-ellipsis-vertical"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="`Actions for ${row.name}`"
                  />
                </UDropdownMenu>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- footer -->
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-default px-5 py-3.5">
        <span class="text-[13px] text-muted tabular-nums">Showing {{ visibleRows.length }} of {{ counts.all }} files</span>
      </div>
    </template>

    <!-- empty -->
    <div
      v-else
      class="flex flex-col items-center px-6 py-16 text-center"
    >
      <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted">
        <UIcon
          :name="counts.all === 0 ? 'i-lucide-folder-open' : 'i-lucide-search'"
          class="size-6"
        />
      </span>
      <h3 class="font-display text-lg font-medium text-highlighted">
        {{ counts.all === 0 ? 'No Files Yet' : 'No Files Match' }}
      </h3>
      <p class="mt-1.5 max-w-xs text-sm text-muted">
        {{ counts.all === 0 ? 'Upload brand assets, contracts, and deliverables to keep everything in one place.' : 'Try a different search or clear the filters.' }}
      </p>
      <UButton
        v-if="counts.all === 0"
        icon="i-lucide-upload"
        color="primary"
        class="mt-5"
        @click="openUpload"
      >
        Upload a File
      </UButton>
      <UButton
        v-else
        color="neutral"
        variant="outline"
        class="mt-5 rounded-full"
        @click="search = ''; tab = 'all'; clientFilter = 'all'"
      >
        Clear Filters
      </UButton>
    </div>
  </div>

  <!-- upload modal -->
  <UModal
    v-model:open="uploadOpen"
    title="Upload Files"
    :ui="{ content: 'max-w-lg' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <!-- drop zone / picker -->
        <button
          type="button"
          class="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-default bg-muted px-6 py-8 text-center transition-colors hover:border-primary hover:bg-mist"
          @click="pickFiles"
        >
          <UIcon
            name="i-lucide-upload-cloud"
            class="size-7 text-muted"
          />
          <span class="text-sm font-medium text-highlighted">Click to choose files</span>
          <span class="text-[12.5px] text-muted">PDF, images, docs — up to 10&nbsp;MB each</span>
        </button>
        <input
          ref="fileInput"
          type="file"
          multiple
          class="hidden"
          @change="onFilesChosen"
        >

        <!-- staged files -->
        <div
          v-if="pendingFiles.length"
          class="flex flex-col gap-1.5"
        >
          <div
            v-for="(f, i) in pendingFiles"
            :key="i"
            class="flex items-center gap-3 rounded-[10px] bg-muted px-3 py-2"
          >
            <UIcon
              name="i-lucide-file"
              class="size-4 flex-none text-muted"
            />
            <span class="min-w-0 flex-1 truncate text-[13px] text-highlighted">{{ f.name }}</span>
            <span class="flex-none text-[12px] text-muted tabular-nums">{{ formatBytes(f.size) }}</span>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Remove"
              @click="removePending(i)"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <UFormField label="Client (optional)">
            <USelect
              v-model="uploadClientId"
              :items="clientItems"
              placeholder="No specific client"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Category">
            <USelect
              v-model="uploadCategory"
              :items="categoryItems"
              size="lg"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          @click="() => { uploadOpen = false }"
        >
          Cancel
        </UButton>
        <UButton
          color="primary"
          icon="i-lucide-upload"
          :loading="uploading"
          :disabled="!pendingFiles.length"
          @click="submitUpload"
        >
          Upload {{ pendingFiles.length || '' }}
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- delete confirm -->
  <UModal
    :open="!!deleteTarget"
    title="Delete File?"
    @update:open="v => { if (!v) deleteTarget = null }"
  >
    <template #body>
      <div class="flex gap-3.5">
        <span class="inline-flex size-10 flex-none items-center justify-center rounded-[11px] bg-error/10 text-error">
          <UIcon
            name="i-lucide-trash-2"
            class="size-5"
          />
        </span>
        <div class="text-sm text-default">
          <p><span class="font-semibold text-highlighted">{{ deleteTarget?.name }}</span> will be permanently removed — both the record and the file itself. This can’t be undone.</p>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          @click="() => { deleteTarget = null }"
        >
          Keep File
        </UButton>
        <UButton
          color="error"
          icon="i-lucide-trash-2"
          :loading="deleting"
          @click="confirmDelete"
        >
          Delete
        </UButton>
      </div>
    </template>
  </UModal>
</template>
