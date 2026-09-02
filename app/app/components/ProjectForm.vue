<script setup lang="ts">
// Project form — the Statement of Work (Exhibit A of the Website Design &
// Development Agreement). The project is the hub: these fields feed the
// contract's PandaDoc tokens on generation. A modal reused from the Projects
// index rows, the project detail page, and the client Projects tab. Create mode
// shows a compact 5-field form; the full SOW is edit-only.
interface ProjectType { id: number, name: string, key: string, code_prefix: string }
interface ProjectRow {
  id: number
  client_id: number
  project_type_id: number
  name: string
  status: string
  goals: string | null
  pages_included: string | null
  key_features: string | null
  design_deliverables: string | null
  content_provided_by: string | null
  revision_rounds: number
  third_party_costs: string | null
  project_fee: number | null
  deposit_pct: number
  hourly_rate: number | null
  content_deadline: string | null
  start_date: string | null
  target_launch_date: string | null
  special_terms: string | null
  inactivity_days: number
  feedback_days: number
  late_fee_days: number
  bugfix_days: number
  client_company?: string | null
  client_name?: string | null
}

const props = defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  project?: ProjectRow | null
  // Lock the contact when launched from a client (create mode).
  contactId?: number | null
  contactLabel?: string | null
}>()
const emit = defineEmits<{ 'update:open': [boolean], 'saved': [ProjectRow] }>()

const api = useApi()
const toast = useToast()

const STATUS_ITEMS = [
  { label: 'Planning', value: 'planning' },
  { label: 'Awaiting Signature', value: 'awaiting_signature' },
  { label: 'Awaiting Deposit', value: 'awaiting_deposit' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'In Review', value: 'in_review' },
  { label: 'Awaiting Final Payment', value: 'awaiting_final' },
  { label: 'On Hold', value: 'on_hold' },
  { label: 'Completed', value: 'completed' }
]

// Delivery only. The Statement of Work moved to the proposal — sales owns what
// was sold, delivery owns the work — so scope, money and dates are edited there
// and read back here through the project's link. Leaving them editable on the
// project would be worse than useless: the read path prefers the proposal's
// values, so an edit here would silently appear to do nothing.
interface FormState {
  client_id: number | undefined
  project_type_id: number | undefined
  template_id: number | null
  name: string
  status: string
}

function blank(): FormState {
  return {
    client_id: props.contactId ?? undefined,
    project_type_id: undefined,
    template_id: null,
    name: '',
    status: 'planning'
  }
}

interface ProjectTemplate { id: number, name: string, project_type_id: number | null, is_default: boolean }

const form = reactive<FormState>(blank())
const types = ref<ProjectType[]>([])
const templates = ref<ProjectTemplate[]>([])
const contacts = ref<{ label: string, value: number }[]>([])
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const typeItems = computed(() => types.value.map(t => ({ label: t.name, value: t.id })))
// Templates offered for the selected type (type-tagged for it, plus untyped
// ones that work for any type), with a leading "(None)" for a blank project.
const templateItems = computed(() => {
  const forType = templates.value.filter(t => t.project_type_id == null || t.project_type_id === form.project_type_id)
  return [{ label: '(None)', value: null }, ...forType.map(t => ({ label: t.name, value: t.id }))]
})
// The default template for the currently-selected type, if any.
function defaultTemplateId() {
  return templates.value.find(t => t.project_type_id === form.project_type_id && t.is_default)?.id ?? null
}

function fillFrom(p: ProjectRow) {
  Object.assign(form, {
    client_id: p.client_id,
    project_type_id: p.project_type_id,
    name: p.name || '',
    status: p.status
  })
}

async function init() {
  errors.value = {}
  try {
    if (!types.value.length) {
      const { data } = await api<{ data: ProjectType[] }>('/project-types')
      types.value = data
    }
    // Templates power the create-mode picker; harmless to keep loaded for edit.
    if (props.mode === 'create' && !templates.value.length) {
      const { data } = await api<{ data: ProjectTemplate[] }>('/project-templates', { query: { active: 1 } })
      templates.value = data
    }
    // Contact picker only when creating without a locked contact.
    if (props.mode === 'create' && !props.contactId && !contacts.value.length) {
      const { data } = await api<{ data: { id: number, company: string | null, name: string }[] }>('/clients', { query: { limit: 200 } })
      contacts.value = data.map(c => ({ label: c.company || c.name, value: c.id }))
    }
  } catch {
    toast.add({ title: 'Could not load form data', color: 'error' })
  }

  if (props.mode === 'edit' && props.project) {
    fillFrom(props.project)
  } else {
    Object.assign(form, blank())
    form.project_type_id = types.value[0]?.id ?? undefined
    form.template_id = defaultTemplateId()
  }
}

watch(() => props.open, (o) => {
  if (o) init()
})

// Switching project type re-points the template to that type's default (create
// mode only; templates don't apply on edit).
watch(() => form.project_type_id, () => {
  if (props.mode === 'create') form.template_id = defaultTemplateId()
})

function payload() {
  return {
    client_id: form.client_id,
    project_type_id: form.project_type_id,
    name: form.name.trim(),
    status: form.status
  }
}

function validate() {
  const e: Record<string, string> = {}
  if (!form.name.trim()) e.name = 'A project name is required.'
  if (props.mode === 'create' && !form.client_id) e.client_id = 'Choose a client.'
  if (!form.project_type_id) e.project_type_id = 'Choose a project type.'
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (saving.value) return
  if (!validate()) return
  saving.value = true
  try {
    let project: ProjectRow
    if (props.mode === 'create') {
      // template_id seeds the project's milestones + tasks; create-only.
      const { data } = await api<{ data: ProjectRow }>('/projects', { method: 'POST', body: { ...payload(), template_id: form.template_id } })
      project = data
      toast.add({ title: 'Project created', description: `${project.name} was added.`, color: 'success' })
    } else {
      const { data } = await api<{ data: ProjectRow }>(`/projects/${props.project!.id}`, { method: 'PATCH', body: payload() })
      project = data
      toast.add({ title: 'Project saved', color: 'success' })
    }
    emit('saved', project)
    emit('update:open', false)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string, fields?: Record<string, string> } } }
    toast.add({ title: 'Could not save project', description: e?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}

const lockedContactLabel = computed(() => props.contactLabel || props.project?.client_company || props.project?.client_name || 'Selected client')
</script>

<template>
  <UModal
    :open="open"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="flex max-h-[85vh] flex-col">
        <!-- header -->
        <div class="flex-none border-b border-default px-6 py-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Statement of work
              </div>
              <h2 class="mt-1 font-display text-[22px] font-semibold tracking-tight text-highlighted">
                {{ mode === 'edit' ? 'Edit Project' : 'New Project' }}
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

        <!-- body -->
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div class="flex flex-col gap-5">
            <!-- Basics (always shown) -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField
                label="Client"
                :required="mode === 'create'"
                :error="errors.client_id"
              >
                <UInput
                  v-if="mode === 'edit' || contactId"
                  :model-value="lockedContactLabel"
                  disabled
                  size="lg"
                  class="w-full"
                />
                <USelect
                  v-else
                  v-model="form.client_id"
                  :items="contacts"
                  placeholder="Choose a client…"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Project Type"
                :required="true"
                :error="errors.project_type_id"
              >
                <USelect
                  v-model="form.project_type_id"
                  :items="typeItems"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <UFormField
                label="Project Name"
                :required="true"
                :error="errors.name"
              >
                <UInput
                  v-model="form.name"
                  placeholder="Marketing site rebuild"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Status">
                <USelect
                  v-model="form.status"
                  :items="STATUS_ITEMS"
                  size="lg"
                  class="w-full sm:w-44"
                />
              </UFormField>
            </div>

            <!-- Template seeds milestones + tasks on create; not editable after. -->
            <UFormField
              v-if="mode === 'create'"
              label="Template"
              help="Auto-sets-up milestones and tasks from a saved template. Manage templates in Settings."
            >
              <USelect
                v-model="form.template_id"
                :items="templateItems"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <!-- The Statement of Work is not here any more: it belongs to the
                 proposal this project was born from. The project page links
                 through to it. -->
          </div>
        </div>

        <!-- footer -->
        <div class="flex-none border-t border-default px-6 py-4">
          <div class="flex items-center justify-end gap-2.5">
            <UButton
              color="neutral"
              variant="outline"
              class="rounded-full"
              @click="emit('update:open', false)"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              class="rounded-full"
              :loading="saving"
              @click="save"
            >
              {{ mode === 'edit' ? 'Save Changes' : 'Create Project' }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
