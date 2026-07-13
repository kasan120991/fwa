<script setup lang="ts">
// Milestone form — create/edit a delivery milestone on a project. A lightweight
// modal (there's no task edit form to reuse). `state` is a manual override;
// task completion drives the progress bar shown on the project board.
interface MilestoneRow {
  id: number
  project_id: number
  title: string
  description: string | null
  state: 'upcoming' | 'in_progress' | 'complete'
  position: number
  target_date: string | null
}

const props = defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  projectId: number
  milestone?: MilestoneRow | null
}>()
const emit = defineEmits<{ 'update:open': [boolean], 'saved': [MilestoneRow] }>()

const api = useApi()
const toast = useToast()

const STATE_ITEMS = [
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Complete', value: 'complete' }
]

interface FormState { title: string, description: string, state: string, target_date: string }
const blank = (): FormState => ({ title: '', description: '', state: 'upcoming', target_date: '' })
const form = reactive<FormState>(blank())
const errors = ref<Record<string, string>>({})
const saving = ref(false)

function init() {
  errors.value = {}
  if (props.mode === 'edit' && props.milestone) {
    form.title = props.milestone.title
    form.description = props.milestone.description ?? ''
    form.state = props.milestone.state
    form.target_date = props.milestone.target_date ?? ''
  } else {
    Object.assign(form, blank())
  }
}
watch(() => props.open, (o) => {
  if (o) init()
})

function validate() {
  const e: Record<string, string> = {}
  if (!form.title.trim()) e.title = 'A milestone title is required.'
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (saving.value) return
  if (!validate()) return
  saving.value = true
  const body = {
    title: form.title.trim(),
    description: form.description.trim() || null,
    state: form.state,
    target_date: form.target_date || null
  }
  try {
    let milestone: MilestoneRow
    if (props.mode === 'create') {
      const { data } = await api<{ data: MilestoneRow }>('/milestones', { method: 'POST', body: { ...body, project_id: props.projectId } })
      milestone = data
    } else {
      const { data } = await api<{ data: MilestoneRow }>(`/milestones/${props.milestone!.id}`, { method: 'PATCH', body })
      milestone = data
    }
    emit('saved', milestone)
    emit('update:open', false)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not save milestone', description: e?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :ui="{ content: 'sm:max-w-lg' }"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="flex flex-col">
        <div class="flex-none border-b border-default px-6 py-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
                Milestone
              </div>
              <h2 class="mt-1 font-display text-[22px] font-medium tracking-tight text-highlighted">
                {{ mode === 'edit' ? 'Edit Milestone' : 'New Milestone' }}
              </h2>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              square
              aria-label="Close"
              @click="emit('update:open', false)"
            />
          </div>
        </div>

        <div class="flex flex-col gap-4 px-6 py-5">
          <UFormField
            label="Title"
            :error="errors.title"
            required
          >
            <UInput
              v-model="form.title"
              placeholder="e.g. Design"
              size="lg"
              class="w-full"
              @keydown.enter="save"
            />
          </UFormField>
          <UFormField label="Description">
            <UTextarea
              v-model="form.description"
              :rows="3"
              placeholder="Optional — what this phase covers."
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="State">
              <USelect
                v-model="form.state"
                :items="STATE_ITEMS"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Target date">
              <UInput
                v-model="form.target_date"
                type="date"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>

        <div class="flex flex-none items-center justify-end gap-2 border-t border-default px-6 py-4">
          <UButton
            color="neutral"
            variant="ghost"
            @click="emit('update:open', false)"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="saving"
            @click="save"
          >
            {{ mode === 'edit' ? 'Save' : 'Create' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
