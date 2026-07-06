<script setup lang="ts">
// Project form — the Statement of Work (Exhibit A of the Website Design &
// Development Agreement). The project is the hub: these fields feed the
// contract's PandaDoc tokens on generation. A modal reused from the Projects
// index rows, the project detail page, and the client Projects tab. Create mode
// shows a compact 5-field form; the full SOW is edit-only.
interface ProjectType { id: number, name: string, key: string, code_prefix: string }
interface ProjectRow {
  id: number
  contact_id: number
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
  contact_company?: string | null
  contact_name?: string | null
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
  { label: 'In progress', value: 'in_progress' },
  { label: 'In review', value: 'in_review' },
  { label: 'On hold', value: 'on_hold' },
  { label: 'Completed', value: 'completed' }
]
const CONTENT_BY_ITEMS = [
  { label: 'Client provides content', value: 'client' },
  { label: 'Developer provides content', value: 'developer' },
  { label: 'Mix of both', value: 'mix' }
]

interface FormState {
  contact_id: number | undefined
  project_type_id: number | undefined
  name: string
  status: string
  goals: string
  pages_included: string
  key_features: string
  design_deliverables: string
  content_provided_by: string | undefined
  revision_rounds: number
  third_party_costs: string
  project_fee: number | null
  deposit_pct: number
  hourly_rate: number | null
  content_deadline: string
  start_date: string
  target_launch_date: string
  special_terms: string
  inactivity_days: number
  feedback_days: number
  late_fee_days: number
  bugfix_days: number
}

function blank(): FormState {
  return {
    contact_id: props.contactId ?? undefined,
    project_type_id: undefined,
    name: '', status: 'planning', goals: '', pages_included: '', key_features: '',
    design_deliverables: '', content_provided_by: undefined, revision_rounds: 2, third_party_costs: '',
    project_fee: null, deposit_pct: 50, hourly_rate: null, content_deadline: '', start_date: '', target_launch_date: '',
    special_terms: '', inactivity_days: 30, feedback_days: 5, late_fee_days: 7, bugfix_days: 30
  }
}

const form = reactive<FormState>(blank())
const types = ref<ProjectType[]>([])
const contacts = ref<{ label: string, value: number }[]>([])
const saving = ref(false)
const showPolicy = ref(false)
const errors = ref<Record<string, string>>({})

const typeItems = computed(() => types.value.map(t => ({ label: t.name, value: t.id })))
const deposit = computed(() => (form.project_fee == null ? null : Math.round((form.project_fee * (form.deposit_pct || 0) / 100) * 100) / 100))
const balance = computed(() => (form.project_fee == null || deposit.value == null ? null : Math.round((form.project_fee - deposit.value) * 100) / 100))

function fillFrom(p: ProjectRow) {
  Object.assign(form, {
    contact_id: p.contact_id,
    project_type_id: p.project_type_id,
    name: p.name || '',
    status: p.status,
    goals: p.goals || '', pages_included: p.pages_included || '', key_features: p.key_features || '',
    design_deliverables: p.design_deliverables || '', content_provided_by: p.content_provided_by ?? undefined,
    revision_rounds: p.revision_rounds ?? 2, third_party_costs: p.third_party_costs || '',
    project_fee: p.project_fee, deposit_pct: p.deposit_pct ?? 50, hourly_rate: p.hourly_rate,
    content_deadline: p.content_deadline ? String(p.content_deadline).slice(0, 10) : '',
    start_date: p.start_date ? String(p.start_date).slice(0, 10) : '',
    target_launch_date: p.target_launch_date ? String(p.target_launch_date).slice(0, 10) : '',
    special_terms: p.special_terms || '',
    inactivity_days: p.inactivity_days ?? 30, feedback_days: p.feedback_days ?? 5,
    late_fee_days: p.late_fee_days ?? 7, bugfix_days: p.bugfix_days ?? 30
  })
}

async function init() {
  errors.value = {}
  showPolicy.value = false
  try {
    if (!types.value.length) {
      const { data } = await api<{ data: ProjectType[] }>('/project-types')
      types.value = data
    }
    // Contact picker only when creating without a locked contact.
    if (props.mode === 'create' && !props.contactId && !contacts.value.length) {
      const { data } = await api<{ data: { id: number, company: string | null, name: string }[] }>('/contacts', { query: { limit: 200 } })
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
  }
}

watch(() => props.open, (o) => {
  if (o) init()
})

function nn(v: string) {
  const t = v.trim()
  return t === '' ? null : t
}
function payload() {
  return {
    contact_id: form.contact_id,
    project_type_id: form.project_type_id,
    name: form.name.trim(),
    status: form.status,
    goals: nn(form.goals),
    pages_included: nn(form.pages_included),
    key_features: nn(form.key_features),
    design_deliverables: nn(form.design_deliverables),
    content_provided_by: form.content_provided_by ?? null,
    revision_rounds: form.revision_rounds,
    third_party_costs: nn(form.third_party_costs),
    project_fee: form.project_fee,
    deposit_pct: form.deposit_pct,
    hourly_rate: form.hourly_rate,
    content_deadline: form.content_deadline || null,
    start_date: form.start_date || null,
    target_launch_date: form.target_launch_date || null,
    special_terms: nn(form.special_terms),
    inactivity_days: form.inactivity_days,
    feedback_days: form.feedback_days,
    late_fee_days: form.late_fee_days,
    bugfix_days: form.bugfix_days
  }
}

function validate() {
  const e: Record<string, string> = {}
  if (!form.name.trim()) e.name = 'A project name is required.'
  if (props.mode === 'create' && !form.contact_id) e.contact_id = 'Choose a client.'
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
      const { data } = await api<{ data: ProjectRow }>('/projects', { method: 'POST', body: payload() })
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

const money = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`)
const lockedContactLabel = computed(() => props.contactLabel || props.project?.contact_company || props.project?.contact_name || 'Selected client')
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
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-teal-700">
                Statement of work
              </div>
              <h2 class="mt-1 font-display text-[22px] font-medium tracking-tight text-highlighted">
                {{ mode === 'edit' ? 'Edit project' : 'New project' }}
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
                :error="errors.contact_id"
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
                  v-model="form.contact_id"
                  :items="contacts"
                  placeholder="Choose a client…"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Project type"
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
                label="Project name"
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

            <UFormField label="Project goals / description">
              <UTextarea
                v-model="form.goals"
                :rows="2"
                autoresize
                placeholder="What is the site for? Primary objective."
                class="w-full"
              />
            </UFormField>

            <!-- Full Statement of Work — filled in after creation, so edit-only. -->
            <template v-if="mode === 'edit'">
              <!-- Scope -->
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <UFormField label="Pages included">
                  <UTextarea
                    v-model="form.pages_included"
                    :rows="2"
                    autoresize
                    placeholder="Home, About, Services, Contact"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Key features">
                  <UTextarea
                    v-model="form.key_features"
                    :rows="2"
                    autoresize
                    placeholder="Contact form, gallery, booking, blog"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Design deliverables">
                  <UTextarea
                    v-model="form.design_deliverables"
                    :rows="2"
                    autoresize
                    placeholder="Custom design, mobile-responsive, brand colors"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Third-party costs">
                  <UTextarea
                    v-model="form.third_party_costs"
                    :rows="2"
                    autoresize
                    placeholder="Hosting, domain, plugins — who pays"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <UFormField label="Content provided by">
                  <USelect
                    v-model="form.content_provided_by"
                    :items="CONTENT_BY_ITEMS"
                    placeholder="Select…"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Revision rounds included">
                  <UInput
                    v-model.number="form.revision_rounds"
                    type="number"
                    min="0"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <!-- Fees -->
              <div class="rounded-card bg-muted p-4 ring ring-default">
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <UFormField label="Project fee (total)">
                    <UInput
                      v-model.number="form.project_fee"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      icon="i-lucide-dollar-sign"
                      size="lg"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="Deposit %">
                    <UInput
                      v-model.number="form.deposit_pct"
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      size="lg"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="Hourly rate (extra work)">
                    <UInput
                      v-model.number="form.hourly_rate"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      icon="i-lucide-dollar-sign"
                      size="lg"
                      class="w-full"
                    />
                  </UFormField>
                </div>
                <div class="mt-3 flex items-center gap-4 text-[13px] text-muted">
                  <span>Deposit ({{ form.deposit_pct || 0 }}%): <span class="font-semibold text-highlighted tabular-nums">{{ money(deposit) }}</span></span>
                  <span>Final ({{ 100 - (form.deposit_pct || 0) }}%): <span class="font-semibold text-highlighted tabular-nums">{{ money(balance) }}</span></span>
                </div>
              </div>

              <!-- Dates -->
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <UFormField label="Content deadline">
                  <UInput
                    v-model="form.content_deadline"
                    type="date"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Start date">
                  <UInput
                    v-model="form.start_date"
                    type="date"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Target launch">
                  <UInput
                    v-model="form.target_launch_date"
                    type="date"
                    size="lg"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <UFormField label="Special terms / notes">
                <UTextarea
                  v-model="form.special_terms"
                  :rows="2"
                  autoresize
                  placeholder="Anything specific to this engagement."
                  class="w-full"
                />
              </UFormField>

              <!-- Policy terms (collapsible) -->
              <div class="rounded-card ring ring-default">
                <button
                  type="button"
                  class="flex w-full items-center justify-between px-4 py-3 text-left"
                  @click="showPolicy = !showPolicy"
                >
                  <span class="text-[13.5px] font-semibold text-highlighted">Policy terms</span>
                  <UIcon
                    :name="showPolicy ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    class="size-4 text-muted"
                  />
                </button>
                <div
                  v-if="showPolicy"
                  class="grid grid-cols-2 gap-4 border-t border-default px-4 py-4 sm:grid-cols-4"
                >
                  <UFormField label="Inactivity (days)">
                    <UInput
                      v-model.number="form.inactivity_days"
                      type="number"
                      min="0"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="Feedback (days)">
                    <UInput
                      v-model.number="form.feedback_days"
                      type="number"
                      min="0"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="Late (days)">
                    <UInput
                      v-model.number="form.late_fee_days"
                      type="number"
                      min="0"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="Bug-fix (days)">
                    <UInput
                      v-model.number="form.bugfix_days"
                      type="number"
                      min="0"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </div>
            </template>
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
              {{ mode === 'edit' ? 'Save changes' : 'Create project' }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
