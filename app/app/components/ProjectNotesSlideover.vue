<script setup lang="ts">
// Project notes — an internal scratchpad reached from Quick Actions.
// Deliberately admin-only: no portal route reads project_notes, so anything
// written here stays inside Ops. Client-facing messages go through tickets.
interface Note { id: number, body: string, created_at: string }

const props = defineProps<{ open: boolean, projectId: number }>()
const emit = defineEmits<{ 'update:open': [boolean], 'changed': [number] }>()

const api = useApi()
const toast = useToast()

const notes = ref<Note[]>([])
const draft = ref('')
const saving = ref(false)
const editingId = ref<number | null>(null)
const editDraft = ref('')

async function load() {
  try {
    const { data } = await api<{ data: Note[] }>(`/projects/${props.projectId}/notes`)
    notes.value = data
    emit('changed', data.length)
  } catch {
    toast.add({ title: 'Could not load notes', color: 'error' })
  }
}
watch(() => props.open, (o) => {
  if (o) load()
})

async function save() {
  const body = draft.value.trim()
  if (!body) return
  saving.value = true
  try {
    const { data } = await api<{ data: Note }>(`/projects/${props.projectId}/notes`, { method: 'POST', body: { body } })
    notes.value = [data, ...notes.value]
    emit('changed', notes.value.length)
    draft.value = ''
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not save the note', description: e?.data?.error?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

function startEdit(n: Note) {
  editingId.value = n.id
  editDraft.value = n.body
}
async function commitEdit(n: Note) {
  const body = editDraft.value.trim()
  if (!body) return
  try {
    const { data } = await api<{ data: Note }>(`/projects/${props.projectId}/notes/${n.id}`, { method: 'PATCH', body: { body } })
    notes.value = notes.value.map(x => (x.id === n.id ? data : x))
  } catch {
    toast.add({ title: 'Could not update the note', color: 'error' })
  } finally {
    editingId.value = null
  }
}
async function remove(n: Note) {
  try {
    await api(`/projects/${props.projectId}/notes/${n.id}`, { method: 'DELETE' })
    notes.value = notes.value.filter(x => x.id !== n.id)
    emit('changed', notes.value.length)
  } catch {
    toast.add({ title: 'Could not delete the note', color: 'error' })
  }
}
</script>

<template>
  <USlideover
    :open="open"
    title="Notes"
    description="Internal only — nothing here reaches the client portal."
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <div class="flex flex-col gap-5">
        <form
          class="flex flex-col gap-3"
          @submit.prevent="save"
        >
          <UTextarea
            v-model="draft"
            :rows="3"
            placeholder="Decisions, gotchas, things the client said…"
            class="w-full"
          />
          <UButton
            type="submit"
            class="ms-auto rounded-full"
            :loading="saving"
            :disabled="!draft.trim()"
          >
            Save Note
          </UButton>
        </form>

        <div>
          <p
            v-if="!notes.length"
            class="text-[13px] text-muted"
          >
            No notes on this project yet.
          </p>
          <div
            v-for="n in notes"
            :key="n.id"
            class="group border-b border-default py-3 last:border-b-0"
          >
            <template v-if="editingId === n.id">
              <UTextarea
                v-model="editDraft"
                :rows="3"
                class="w-full"
              />
              <div class="mt-2 flex justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="editingId = null"
                >
                  Cancel
                </UButton>
                <UButton
                  size="xs"
                  class="rounded-full"
                  @click="commitEdit(n)"
                >
                  Save
                </UButton>
              </div>
            </template>
            <template v-else>
              <p class="whitespace-pre-wrap text-[13.5px] leading-relaxed text-default">
                {{ n.body }}
              </p>
              <div class="mt-1.5 flex items-center gap-2">
                <span class="text-[11.5px] text-muted">{{ shortDate(n.created_at) }}</span>
                <span class="ms-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <UButton
                    icon="i-lucide-pencil"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Edit note"
                    @click="startEdit(n)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Delete note"
                    @click="remove(n)"
                  />
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
