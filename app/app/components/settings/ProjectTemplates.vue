<script setup lang="ts">
// Settings → Project Templates: named, reusable delivery blueprints. Each holds
// ordered milestones with tasks (plus a milestone-less "General" bucket). Picked
// in the New Project form to auto-set-up a project's milestones + tasks; a type's
// default template applies when none is chosen. CRUD via /api/project-templates.
const api = useApi()
const toast = useToast()

interface ProjectType { id: number, name: string }
interface TemplateRow {
  id: number
  name: string
  description: string | null
  project_type_id: number | null
  type_name: string | null
  is_default: boolean
  is_active: boolean
  milestone_count: number
  task_count: number
}
interface TaskDraft { title: string }
interface MilestoneDraft { title: string, tasks: TaskDraft[] }
interface Editor {
  id: number | null
  name: string
  description: string
  project_type_id: number | null
  is_default: boolean
  is_active: boolean
  milestones: MilestoneDraft[]
  general: TaskDraft[]
}

const templates = ref<TemplateRow[]>([])
const types = ref<ProjectType[]>([])
const pending = ref(true)
const saving = ref(false)
const editing = ref<Editor | null>(null)
const errors = ref<Record<string, string>>({})

const typeItems = computed(() => [{ label: 'Any type', value: null }, ...types.value.map(t => ({ label: t.name, value: t.id }))])

async function load() {
  pending.value = true
  try {
    const [tpl, ty] = await Promise.all([
      api<{ data: TemplateRow[] }>('/project-templates'),
      api<{ data: ProjectType[] }>('/project-types')
    ])
    templates.value = tpl.data
    types.value = ty.data
  } catch {
    toast.add({ title: 'Couldn\'t load templates', color: 'error' })
  } finally {
    pending.value = false
  }
}
onMounted(load)

function typeName(id: number | null) {
  if (id == null) return 'Any type'
  return types.value.find(t => t.id === id)?.name ?? 'Any type'
}

// ---- editor lifecycle ---------------------------------------------------
function startNew() {
  errors.value = {}
  editing.value = {
    id: null,
    name: '',
    description: '',
    project_type_id: types.value[0]?.id ?? null,
    is_default: false,
    is_active: true,
    milestones: [{ title: '', tasks: [] }],
    general: []
  }
}

async function startEdit(id: number) {
  errors.value = {}
  try {
    const { data } = await api<{
      data: TemplateRow & {
        milestones: { title: string, tasks: { title: string }[] }[]
        general: { title: string }[]
      }
    }>(`/project-templates/${id}`)
    editing.value = {
      id: data.id,
      name: data.name,
      description: data.description ?? '',
      project_type_id: data.project_type_id,
      is_default: data.is_default,
      is_active: data.is_active,
      milestones: data.milestones.map(m => ({ title: m.title, tasks: m.tasks.map(t => ({ title: t.title })) })),
      general: data.general.map(t => ({ title: t.title }))
    }
    if (!editing.value.milestones.length) editing.value.milestones.push({ title: '', tasks: [] })
  } catch {
    toast.add({ title: 'Couldn\'t open template', color: 'error' })
  }
}

function cancel() {
  editing.value = null
  errors.value = {}
}

// ---- builder mutations --------------------------------------------------
function addMilestone() {
  editing.value?.milestones.push({ title: '', tasks: [] })
}
function removeMilestone(i: number) {
  editing.value?.milestones.splice(i, 1)
}
function moveMilestone(i: number, dir: -1 | 1) {
  const ms = editing.value?.milestones
  if (!ms) return
  const j = i + dir
  if (j < 0 || j >= ms.length) return
  const [m] = ms.splice(i, 1)
  ms.splice(j, 0, m)
}
function addTask(mi: number) {
  editing.value?.milestones[mi]?.tasks.push({ title: '' })
}
function removeTask(mi: number, ti: number) {
  editing.value?.milestones[mi]?.tasks.splice(ti, 1)
}
function addGeneralTask() {
  editing.value?.general.push({ title: '' })
}
function removeGeneralTask(ti: number) {
  editing.value?.general.splice(ti, 1)
}

// ---- persistence --------------------------------------------------------
async function save() {
  const e = editing.value
  if (!e || saving.value) return
  errors.value = {}
  if (!e.name.trim()) {
    errors.value = { name: 'A template name is required.' }
    return
  }
  // Drop empty rows so blank builder lines don't persist.
  const milestones = e.milestones
    .map(m => ({ title: m.title.trim(), tasks: m.tasks.map(t => ({ title: t.title.trim() })).filter(t => t.title) }))
    .filter(m => m.title)
  const general = e.general.map(t => ({ title: t.title.trim() })).filter(t => t.title)

  const body = {
    name: e.name.trim(),
    description: e.description.trim() || null,
    project_type_id: e.project_type_id,
    is_default: e.is_default,
    is_active: e.is_active,
    milestones,
    general
  }

  saving.value = true
  try {
    if (e.id) await api(`/project-templates/${e.id}`, { method: 'PUT', body })
    else await api('/project-templates', { method: 'POST', body })
    toast.add({ title: e.id ? 'Template saved' : 'Template created', color: 'success' })
    editing.value = null
    await load()
  } catch (err: unknown) {
    const x = err as { data?: { error?: { message?: string, fields?: Record<string, string> } } }
    errors.value = x?.data?.error?.fields ?? {}
    toast.add({ title: 'Couldn\'t save template', description: x?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function remove(row: TemplateRow) {
  if (!confirm(`Delete the "${row.name}" template? Projects already created keep their milestones and tasks.`)) return
  try {
    await api(`/project-templates/${row.id}`, { method: 'DELETE' })
    toast.add({ title: 'Template deleted', color: 'success' })
    await load()
  } catch {
    toast.add({ title: 'Couldn\'t delete template', color: 'error' })
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- ===== List view ===== -->
    <section
      v-if="!editing"
      class="rounded-card bg-default p-6 ring ring-default"
    >
      <div class="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-highlighted">
            Project Templates
          </h2>
          <p class="mt-1 text-[13.5px] text-muted">
            Reusable delivery plans. Pick one when creating a project to auto-set-up its milestones and tasks.
          </p>
        </div>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="lg"
          class="flex-none"
          @click="startNew"
        >
          New Template
        </UButton>
      </div>

      <!-- loading -->
      <div
        v-if="pending"
        class="flex items-center justify-center py-12 text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 animate-spin"
        />
      </div>

      <!-- empty -->
      <div
        v-else-if="!templates.length"
        class="flex flex-col items-center rounded-[14px] border-[1.5px] border-dashed border-accented px-6 py-12 text-center"
      >
        <UIcon
          name="i-lucide-list-checks"
          class="size-6 text-muted"
        />
        <p class="mt-2 text-sm font-semibold text-highlighted">
          No templates yet
        </p>
        <p class="mt-1 max-w-[320px] text-[13px] text-muted">
          Create a template to lay out the milestones and tasks a new project should start with.
        </p>
      </div>

      <!-- rows -->
      <ul
        v-else
        class="divide-y divide-default"
      >
        <li
          v-for="row in templates"
          :key="row.id"
          class="flex items-center gap-3 py-3.5"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate text-sm font-semibold text-highlighted">{{ row.name }}</span>
              <StatusChip
                v-if="row.is_default"
                label="Default"
                status="success"
              />
              <StatusChip
                v-if="!row.is_active"
                label="Inactive"
                status="neutral"
              />
            </div>
            <p class="mt-0.5 text-[12.5px] text-muted">
              {{ typeName(row.project_type_id) }} · {{ row.milestone_count }} milestone{{ row.milestone_count === 1 ? '' : 's' }} · {{ row.task_count }} task{{ row.task_count === 1 ? '' : 's' }}
            </p>
          </div>
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Edit template"
            @click="startEdit(row.id)"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Delete template"
            @click="remove(row)"
          />
        </li>
      </ul>
    </section>

    <!-- ===== Editor view ===== -->
    <template v-else>
      <!-- template meta -->
      <section class="rounded-card bg-default p-6 ring ring-default">
        <div class="mb-5 flex items-center gap-2">
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Back to list"
            @click="cancel"
          />
          <h2 class="text-base font-semibold text-highlighted">
            {{ editing.id ? 'Edit Template' : 'New Template' }}
          </h2>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <UFormField
            label="Template Name"
            :required="true"
            :error="errors.name"
          >
            <UInput
              v-model="editing.name"
              placeholder="Website Build"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Project Type">
            <USelect
              v-model="editing.project_type_id"
              :items="typeItems"
              size="lg"
              class="w-full sm:w-52"
            />
          </UFormField>
        </div>

        <UFormField
          label="Description"
          class="mt-4"
        >
          <UInput
            v-model="editing.description"
            placeholder="Standard delivery plan for a website project."
            size="lg"
            class="w-full"
          />
        </UFormField>

        <div class="mt-5 flex flex-wrap items-center gap-6 border-t border-default pt-4">
          <USwitch
            v-model="editing.is_default"
            label="Default for this type"
            :description="editing.project_type_id == null ? 'Set a project type to use as a default.' : 'Applied when a project is created without a template.'"
            :disabled="editing.project_type_id == null"
          />
          <USwitch
            v-model="editing.is_active"
            label="Active"
            description="Inactive templates are hidden from the New Project picker."
          />
        </div>
      </section>

      <!-- milestone + task builder -->
      <section class="rounded-card bg-default p-6 ring ring-default">
        <div class="mb-4">
          <h2 class="text-base font-semibold text-highlighted">
            Milestones & Tasks
          </h2>
          <p class="mt-1 text-[13.5px] text-muted">
            Tasks are grouped under milestones. Use General for tasks that don't belong to a milestone.
          </p>
        </div>

        <div class="flex flex-col gap-4">
          <div
            v-for="(m, mi) in editing.milestones"
            :key="mi"
            class="rounded-[14px] bg-muted/40 p-4 ring ring-default"
          >
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-flag"
                class="size-4 flex-none text-muted"
              />
              <UInput
                v-model="m.title"
                :placeholder="`Milestone ${mi + 1} (e.g. Discovery)`"
                size="lg"
                class="w-full"
              />
              <UButton
                icon="i-lucide-chevron-up"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="mi === 0"
                aria-label="Move up"
                @click="moveMilestone(mi, -1)"
              />
              <UButton
                icon="i-lucide-chevron-down"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="mi === editing.milestones.length - 1"
                aria-label="Move down"
                @click="moveMilestone(mi, 1)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Remove milestone"
                @click="removeMilestone(mi)"
              />
            </div>

            <!-- tasks under this milestone -->
            <div class="mt-3 flex flex-col gap-2 pl-6">
              <div
                v-for="(t, ti) in m.tasks"
                :key="ti"
                class="flex items-center gap-2"
              >
                <span class="size-1.5 flex-none rounded-full bg-dimmed" />
                <UInput
                  v-model="t.title"
                  placeholder="Task title"
                  size="md"
                  class="w-full"
                />
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Remove task"
                  @click="removeTask(mi, ti)"
                />
              </div>
              <button
                type="button"
                class="mt-0.5 flex w-fit items-center gap-1.5 text-[13px] font-medium text-primary transition-colors hover:text-primary/80"
                @click="addTask(mi)"
              >
                <UIcon
                  name="i-lucide-plus"
                  class="size-3.5"
                />
                Add a task
              </button>
            </div>
          </div>

          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="lg"
            class="w-fit"
            @click="addMilestone"
          >
            Add Milestone
          </UButton>
        </div>

        <!-- general (milestone-less) tasks -->
        <div class="mt-6 border-t border-default pt-5">
          <div class="mb-3 flex items-center gap-2">
            <UIcon
              name="i-lucide-inbox"
              class="size-4 flex-none text-muted"
            />
            <h3 class="text-sm font-semibold text-highlighted">
              General Tasks
            </h3>
          </div>
          <div class="flex flex-col gap-2 pl-6">
            <div
              v-for="(t, ti) in editing.general"
              :key="ti"
              class="flex items-center gap-2"
            >
              <span class="size-1.5 flex-none rounded-full bg-dimmed" />
              <UInput
                v-model="t.title"
                placeholder="Task title"
                size="md"
                class="w-full"
              />
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Remove task"
                @click="removeGeneralTask(ti)"
              />
            </div>
            <button
              type="button"
              class="mt-0.5 flex w-fit items-center gap-1.5 text-[13px] font-medium text-primary transition-colors hover:text-primary/80"
              @click="addGeneralTask"
            >
              <UIcon
                name="i-lucide-plus"
                class="size-3.5"
              />
              Add a task
            </button>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-3 border-t border-default pt-4">
          <UButton
            color="neutral"
            variant="ghost"
            size="lg"
            @click="cancel"
          >
            Cancel
          </UButton>
          <UButton
            :loading="saving"
            color="primary"
            size="lg"
            @click="save"
          >
            {{ editing.id ? 'Save Template' : 'Create Template' }}
          </UButton>
        </div>
      </section>
    </template>
  </div>
</template>
