<script setup lang="ts">
// Write or edit a proposal. The Statement of Work is the substance here — this
// is the document the client agrees to, and accepting it is what generates the
// contract, so the scope fields are the point rather than an afterthought.

const props = defineProps<{ open: boolean, proposalId: number | null }>()
const emit = defineEmits<{ 'update:open': [boolean], 'saved': [] }>()

const api = useApi()
const toast = useToast()

interface ClientOpt { id: number, name: string, company: string | null }
interface TypeOpt { id: number, name: string }

const clients = ref<ClientOpt[]>([])
const types = ref<TypeOpt[]>([])
const saving = ref(false)
const loading = ref(false)
const errors = ref<Record<string, string>>({})
const decided = ref(false)

const basics = reactive({ client_id: undefined as number | undefined, project_type_id: undefined as number | undefined, title: '' })
const sow = ref<SowState>(blankSow())

const isEdit = computed(() => props.proposalId != null)

watch(() => props.open, async (open) => {
  if (!open) return
  errors.value = {}
  decided.value = false
  const [c, t] = await Promise.all([
    api<{ data: ClientOpt[] }>('/clients?limit=200'),
    api<{ data: TypeOpt[] }>('/project-types')
  ])
  clients.value = c.data
  types.value = t.data

  if (props.proposalId == null) {
    basics.client_id = undefined
    basics.project_type_id = types.value[0]?.id
    basics.title = ''
    sow.value = blankSow()
    return
  }
  loading.value = true
  try {
    const { data } = await api<{ data: Record<string, unknown> }>(`/proposals/${props.proposalId}`)
    basics.client_id = Number(data.client_id)
    basics.project_type_id = data.project_type_id ? Number(data.project_type_id) : undefined
    basics.title = String(data.title ?? '')
    // A decided proposal is the record of what was agreed — the server refuses
    // edits, so the form shows it read-only rather than letting you try.
    decided.value = data.status === 'accepted' || data.status === 'declined'
    const next = blankSow()
    for (const k of Object.keys(next) as (keyof SowState)[]) {
      const v = data[k]
      if (v === null || v === undefined) continue
      // Dates come back as ISO timestamps; the date inputs want YYYY-MM-DD.
      ;(next[k] as unknown) = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : v
    }
    sow.value = next
  } finally {
    loading.value = false
  }
})

function validate() {
  const e: Record<string, string> = {}
  if (!basics.title.trim()) e.title = 'A title is required.'
  if (!isEdit.value && !basics.client_id) e.client_id = 'Choose a client.'
  if (sow.value.deposit_pct <= 0 || sow.value.deposit_pct > 100) e.deposit_pct = 'Between 1 and 100.'
  errors.value = e
  return Object.keys(e).length === 0
}

/** Empty strings mean "cleared" to the API, which is what null expresses. */
function payload() {
  const out: Record<string, unknown> = { title: basics.title.trim(), project_type_id: basics.project_type_id }
  // '' and undefined both mean "cleared"; the API expresses that as null.
  for (const [k, v] of Object.entries(sow.value)) out[k] = (v === '' || v === undefined) ? null : v
  return out
}

async function save() {
  if (saving.value || !validate()) return
  saving.value = true
  try {
    if (isEdit.value) {
      await api(`/proposals/${props.proposalId}`, { method: 'PATCH', body: payload() })
      toast.add({ title: 'Proposal saved', color: 'success' })
    } else {
      await api('/proposals', { method: 'POST', body: { client_id: basics.client_id, ...payload() } })
      toast.add({ title: 'Proposal created', description: 'Send it, or accept it if they already said yes.', color: 'success' })
    }
    emit('saved')
    emit('update:open', false)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string, fields?: Record<string, string> } } }
    if (e?.data?.error?.fields) errors.value = e.data.error.fields
    toast.add({ title: 'Could not save', description: e?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}

const clientItems = computed(() => clients.value.map(c => ({ label: c.company || c.name, value: c.id })))
const typeItems = computed(() => types.value.map(t => ({ label: t.name, value: t.id })))
const lockedClient = computed(() => {
  const c = clients.value.find(x => x.id === basics.client_id)
  return c ? (c.company || c.name) : '—'
})
</script>

<template>
  <UModal
    :open="open"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="flex max-h-[85vh] flex-col">
        <div class="flex-none border-b border-default px-6 py-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Statement of work
              </div>
              <h2 class="mt-1 font-display text-[22px] font-semibold tracking-tight text-highlighted">
                {{ isEdit ? 'Edit Proposal' : 'New Proposal' }}
              </h2>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="outline"
              square
              size="sm"
              aria-label="Close"
              @click="emit('update:open', false)"
            />
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div
            v-if="loading"
            class="py-12 text-center text-sm text-muted"
          >
            Loading…
          </div>
          <div
            v-else
            class="flex flex-col gap-5"
          >
            <UAlert
              v-if="decided"
              icon="i-lucide-lock"
              color="neutral"
              variant="soft"
              title="This proposal has been decided"
              description="Its scope is the record of what was agreed, so it can't be edited."
            />

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField
                label="Client"
                :required="!isEdit"
                :error="errors.client_id"
              >
                <UInput
                  v-if="isEdit"
                  :model-value="lockedClient"
                  disabled
                  size="lg"
                  class="w-full"
                />
                <USelectMenu
                  v-else
                  v-model="basics.client_id"
                  :items="clientItems"
                  value-key="value"
                  placeholder="Choose a client…"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Project Type"
                :error="errors.project_type_id"
                hint="Pins which agreement it generates"
              >
                <USelectMenu
                  v-model="basics.project_type_id"
                  :items="typeItems"
                  value-key="value"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField
              label="Title"
              required
              :error="errors.title"
            >
              <UInput
                v-model="basics.title"
                placeholder="Marketing site rebuild"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Goals / Description">
              <UTextarea
                v-model="sow.goals"
                :rows="3"
                autoresize
                placeholder="What this project is for, in the client's words."
                class="w-full"
              />
            </UFormField>

            <SowFields v-model="sow" />
          </div>
        </div>

        <div class="flex-none border-t border-default px-6 py-4">
          <div class="flex items-center justify-end gap-2.5">
            <UButton
              color="neutral"
              variant="outline"
              @click="emit('update:open', false)"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="saving"
              :disabled="decided"
              @click="save"
            >
              {{ isEdit ? 'Save Proposal' : 'Create Proposal' }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
