<script setup lang="ts">
// Entity-scoped Files panel — used on the Client detail and Project detail
// pages. Lists a client's (or project's) files grouped by category, with upload
// and delete. Shares the /files page's model + upload/delete flow; the central
// /files page keeps its own richer chrome (stats, filters, cross-client table).
type Category = 'brand' | 'contract' | 'deliverable' | 'other'

const props = defineProps<{
  clientId?: number
  projectId?: number
}>()

// Emitted after every load so the host page can badge its tab with the count.
const emit = defineEmits<{ 'update:count': [number] }>()

interface ApiFile {
  id: number
  client_id: number | null
  project_id: number | null
  category: Category
  path: string
  name: string
  title: string | null
  mime: string | null
  size_bytes: number | string | null
  created_at: string
  uploaded_by_name: string | null
}

interface FileRow {
  id: number
  name: string
  title: string | null
  label: string
  ext: string
  path: string
  category: Category
  size: number | null
  meta: string
  createdAt: string
}

const api = useApi()
const toast = useToast()
const { upload, resolveUrl } = useUploads()

const files = ref<FileRow[]>([])
const pending = ref(true)

const CATEGORY_META: Record<Category, { label: string }> = {
  brand: { label: 'Brand & Design' },
  contract: { label: 'Contracts' },
  deliverable: { label: 'Deliverables' },
  other: { label: 'Other' }
}
const CATEGORY_ORDER = Object.keys(CATEGORY_META) as Category[]
const categoryItems = CATEGORY_ORDER.map(c => ({ label: CATEGORY_META[c].label, value: c }))

// Extension → tint for the file-type badge (matches the /files page).
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
  // Titled files lead with the title and keep the filename in the meta line;
  // untitled ones show the filename as before.
  return {
    id: f.id,
    name: f.name,
    title: f.title,
    label: f.title || f.name,
    ext: extOf(f.name),
    path: f.path,
    category: f.category,
    size: Number.isFinite(size as number) ? size : null,
    meta: `${f.title ? `${f.name} · ` : ''}Uploaded ${shortDate(f.created_at)} · ${who}`,
    createdAt: f.created_at
  }
}

// A project view is project-scoped; a client view shows everything for the client.
const listQuery = computed(() =>
  props.projectId ? { project_id: props.projectId } : { client_id: props.clientId })

async function load() {
  pending.value = true
  try {
    const { data } = await api<{ data: ApiFile[] }>('/files', { query: listQuery.value })
    files.value = data.map(mapFile)
    emit('update:count', files.value.length)
  } catch {
    toast.add({ title: 'Could not load files', color: 'error' })
  } finally {
    pending.value = false
  }
}
onMounted(load)

// Non-empty category groups, in a fixed display order, newest file first.
const groups = computed(() =>
  CATEGORY_ORDER
    .map(key => ({
      key,
      label: CATEGORY_META[key].label,
      files: files.value
        .filter(f => f.category === key)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }))
    .filter(g => g.files.length > 0))

// Live refresh when a file changes anywhere (upload/rename/delete).
let socket: ReturnType<typeof useSocket> | null = null
onMounted(() => {
  socket = useSocket()
  socket.on('file:changed', load)
})
onBeforeUnmount(() => {
  socket?.off('file:changed', load)
})

// ---- upload ----
const uploadOpen = ref(false)
const uploading = ref(false)
const pendingFiles = ref<File[]>([])
const uploadCategory = ref<Category>('other')
const fileInput = ref<HTMLInputElement | null>(null)

function openUpload() {
  pendingFiles.value = []
  uploadCategory.value = 'other'
  uploadOpen.value = true
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
          client_id: props.clientId ?? null,
          project_id: props.projectId ?? null,
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

// ---- edit details (title + category) ----
const editTarget = ref<FileRow | null>(null)
const editTitle = ref('')
const editCategory = ref<Category>('other')
const saving = ref(false)

function openEdit(f: FileRow) {
  editTitle.value = f.title || ''
  editCategory.value = f.category
  editTarget.value = f
}

async function submitEdit() {
  if (!editTarget.value || saving.value) return
  saving.value = true
  try {
    await api(`/files/${editTarget.value.id}`, {
      method: 'PATCH',
      body: { title: editTitle.value.trim(), category: editCategory.value }
    })
    toast.add({ title: 'File updated', color: 'success' })
    editTarget.value = null
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not update that file', description: e?.data?.error?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

function rowMenuItems(f: FileRow) {
  return [
    [
      { label: 'Download', icon: 'i-lucide-download', onSelect: () => { window.open(resolveUrl(f.path), '_blank') } },
      { label: 'Edit Details', icon: 'i-lucide-pencil', onSelect: () => openEdit(f) }
    ],
    [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = f } }]
  ]
}
</script>

<template>
  <div>
    <!-- header -->
    <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3.5">
      <span class="text-base font-semibold text-highlighted">Files</span>
      <UButton
        icon="i-lucide-upload"
        color="primary"
        size="sm"
        @click="openUpload"
      >
        Upload
      </UButton>
    </div>

    <div
      v-if="pending"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading files…
    </div>

    <!-- grouped-by-category cards -->
    <div
      v-else-if="groups.length"
      class="flex flex-col gap-4"
    >
      <div
        v-for="g in groups"
        :key="g.key"
        class="overflow-hidden rounded-card bg-default ring ring-default"
      >
        <div class="flex items-center gap-2.5 border-b border-default px-4 py-3">
          <UIcon
            name="i-lucide-folder"
            class="size-4 text-muted"
          />
          <span class="text-[13.5px] font-semibold text-highlighted">{{ g.label }}</span>
          <span class="text-[12.5px] text-muted">{{ g.files.length }} {{ g.files.length === 1 ? 'file' : 'files' }}</span>
        </div>
        <div
          v-for="f in g.files"
          :key="f.id"
          class="flex items-center gap-3 border-t border-default px-4 py-3 transition-colors first:border-t-0 hover:bg-muted"
        >
          <span
            class="inline-flex size-[38px] flex-none items-center justify-center rounded-[9px] bg-muted font-mono text-[10px] font-semibold"
            :class="EXT_CLASS[f.ext] ?? 'text-muted'"
          >{{ f.ext }}</span>
          <div class="min-w-0 flex-1">
            <a
              :href="resolveUrl(f.path)"
              target="_blank"
              rel="noopener"
              class="block truncate text-sm font-medium text-highlighted hover:text-primary hover:underline"
            >{{ f.label }}</a>
            <div class="mt-0.5 text-[12.5px] text-muted">
              {{ f.meta }}
            </div>
          </div>
          <span class="whitespace-nowrap text-[13px] text-muted tabular-nums">{{ formatBytes(f.size) }}</span>
          <UDropdownMenu :items="rowMenuItems(f)">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="`Actions for ${f.label}`"
            />
          </UDropdownMenu>
        </div>
      </div>
    </div>

    <!-- empty -->
    <div
      v-else
      class="flex flex-col items-center rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted">
        <UIcon
          name="i-lucide-folder-open"
          class="size-6"
        />
      </span>
      <h3 class="font-display text-lg font-medium text-highlighted">
        No Files Yet
      </h3>
      <p class="mt-1.5 max-w-xs text-sm text-muted">
        Upload brand assets, contracts, and deliverables to keep everything in one place.
      </p>
      <UButton
        icon="i-lucide-upload"
        color="primary"
        class="mt-5"
        @click="openUpload"
      >
        Upload a File
      </UButton>
    </div>

    <!-- upload modal -->
    <UModal
      v-model:open="uploadOpen"
      title="Upload Files"
      :ui="{ content: 'max-w-lg' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
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

          <UFormField label="Category">
            <USelect
              v-model="uploadCategory"
              :items="categoryItems"
              size="lg"
              class="w-full"
            />
          </UFormField>
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

    <!-- edit details -->
    <UModal
      :open="!!editTarget"
      title="Edit File Details"
      :ui="{ content: 'max-w-md' }"
      @update:open="v => { if (!v) editTarget = null }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField
            label="Title"
            :hint="editTarget?.name"
            help="Shown instead of the filename. Leave blank to show the filename."
          >
            <UInput
              v-model="editTitle"
              placeholder="e.g. Signed Storefront SOW"
              size="lg"
              class="w-full"
              @keydown.enter="submitEdit"
            />
          </UFormField>
          <UFormField label="Category">
            <USelect
              v-model="editCategory"
              :items="categoryItems"
              size="lg"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="() => { editTarget = null }"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="saving"
            @click="submitEdit"
          >
            Save Changes
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
            <p><span class="font-semibold text-highlighted">{{ deleteTarget?.label }}</span> will be permanently removed — both the record and the file itself. This can’t be undone.</p>
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
  </div>
</template>
