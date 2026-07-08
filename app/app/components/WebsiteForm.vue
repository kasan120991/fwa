<script setup lang="ts">
// Create / edit a website. A UModal reused by the Websites dashboard, the website
// detail page, and the client detail Websites tab (client locked when launched from
// a client). POSTs /websites or PATCHes /websites/:id.
interface WebsiteRow {
  id: number
  client_id: number
  project_id: number | null
  name: string
  domain: string
  url: string | null
  environment: string
  analytics_provider: string
  conversion_goal: string | null
  launched_at: string | null
}
const props = defineProps<{
  open: boolean
  mode?: 'create' | 'edit'
  website?: WebsiteRow | null
  // Lock the client when launched from a client detail page.
  contactId?: number | null
  contactLabel?: string | null
}>()
const emit = defineEmits<{ 'update:open': [boolean], 'created': [], 'saved': [WebsiteRow] }>()

const api = useApi()
const toast = useToast()
const mode = computed(() => props.mode ?? 'create')

const ENV_ITEMS = [
  { label: 'Live', value: 'live' },
  { label: 'Staging', value: 'staging' },
  { label: 'Dev', value: 'dev' }
]
const PROVIDER_ITEMS = [
  { label: 'Not connected', value: 'none' },
  { label: 'Plausible', value: 'plausible' },
  { label: 'Google Analytics 4', value: 'ga4' },
  { label: 'Fathom', value: 'fathom' },
  { label: 'Umami', value: 'umami' }
]

interface FormState {
  client_id: number | undefined
  project_id: number | null
  name: string
  domain: string
  url: string
  environment: string
  analytics_provider: string
  conversion_goal: string
  launched_at: string
}
function blank(): FormState {
  return {
    client_id: props.contactId ?? undefined,
    project_id: null,
    name: '', domain: '', url: '', environment: 'live',
    analytics_provider: 'none', conversion_goal: '', launched_at: ''
  }
}
const form = reactive<FormState>(blank())
const clients = ref<{ label: string, value: number }[]>([])
const projects = ref<{ label: string, value: number | null }[]>([{ label: 'No project', value: null }])
const saving = ref(false)
const errors = ref<Record<string, string>>({})

async function loadClients() {
  const { data } = await api<{ data: { id: number, company: string | null, name: string }[] }>('/clients', { query: { limit: 200 } })
  clients.value = data.map(c => ({ label: c.company || c.name, value: c.id }))
}
async function loadProjects(cid: number) {
  const { data } = await api<{ data: { id: number, name: string, code: string | null }[] }>('/projects', { query: { client_id: cid } })
  projects.value = [{ label: 'No project', value: null }, ...data.map(p => ({ label: `${p.code ? p.code + ' · ' : ''}${p.name}`, value: p.id }))]
}

function fillFrom(w: WebsiteRow) {
  Object.assign(form, {
    client_id: w.client_id,
    project_id: w.project_id,
    name: w.name || '',
    domain: w.domain || '',
    url: w.url || '',
    environment: w.environment,
    analytics_provider: w.analytics_provider,
    conversion_goal: w.conversion_goal || '',
    launched_at: w.launched_at ? String(w.launched_at).slice(0, 10) : ''
  })
}

watch(() => props.open, (o) => {
  if (!o) return
  errors.value = {}
  if (mode.value === 'edit' && props.website) {
    fillFrom(props.website)
  } else {
    Object.assign(form, blank())
  }
  // Client picker only when creating without a locked client.
  if (mode.value === 'create' && !props.contactId && !clients.value.length) loadClients()
  if (form.client_id) loadProjects(form.client_id)
})
watch(() => form.client_id, (cid) => {
  if (mode.value === 'edit') return
  form.project_id = null
  projects.value = [{ label: 'No project', value: null }]
  if (cid) loadProjects(cid)
})

function validate() {
  const e: Record<string, string> = {}
  if (!form.client_id) e.client_id = 'Choose a client.'
  if (!form.name.trim()) e.name = 'A site name is required.'
  if (!form.domain.trim()) e.domain = 'A domain is required.'
  errors.value = e
  return Object.keys(e).length === 0
}

async function save() {
  if (saving.value || !validate()) return
  saving.value = true
  const domain = form.domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  const body = {
    client_id: form.client_id,
    project_id: form.project_id,
    name: form.name.trim(),
    domain,
    url: form.url.trim() || `https://${domain}`,
    environment: form.environment,
    analytics_provider: form.analytics_provider,
    conversion_goal: form.conversion_goal.trim() || null,
    launched_at: form.launched_at || null
  }
  try {
    if (mode.value === 'edit' && props.website) {
      const { data } = await api<{ data: WebsiteRow }>(`/websites/${props.website.id}`, { method: 'PATCH', body })
      toast.add({ title: 'Website saved', color: 'success' })
      emit('saved', data)
    } else {
      await api('/websites', { method: 'POST', body })
      toast.add({ title: 'Website added', color: 'success' })
      emit('created')
    }
    emit('update:open', false)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not save website', description: e?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}

const lockedClientLabel = computed(() => props.contactLabel || 'Selected client')
</script>

<template>
  <UModal
    :open="open"
    :ui="{ content: 'sm:max-w-xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="flex max-h-[85vh] flex-col">
        <div class="flex-none border-b border-default px-6 py-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-teal-700">
                Website
              </div>
              <h2 class="mt-1 font-display text-[22px] font-medium tracking-tight text-highlighted">
                {{ mode === 'edit' ? 'Edit Website' : 'Add Website' }}
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
          <div class="flex flex-col gap-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Client" :required="true" :error="errors.client_id">
                <UInput
                  v-if="mode === 'edit' || contactId"
                  :model-value="lockedClientLabel"
                  disabled
                  size="lg"
                  class="w-full"
                />
                <USelect
                  v-else
                  v-model="form.client_id"
                  :items="clients"
                  placeholder="Choose a client…"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Environment">
                <USelect v-model="form.environment" :items="ENV_ITEMS" size="lg" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Site Name" :required="true" :error="errors.name">
                <UInput v-model="form.name" placeholder="Northwind Storefront" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Domain" :required="true" :error="errors.domain">
                <UInput v-model="form.domain" placeholder="northwind.com" size="lg" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Analytics" help="Marks the site connected; metrics sync in later.">
                <USelect v-model="form.analytics_provider" :items="PROVIDER_ITEMS" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Conversion Goal">
                <UInput v-model="form.conversion_goal" placeholder="Contact form" size="lg" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Project (Optional)">
                <USelect v-model="form.project_id" :items="projects" :disabled="!form.client_id" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Launched">
                <UInput v-model="form.launched_at" type="date" size="lg" class="w-full" />
              </UFormField>
            </div>
          </div>
        </div>

        <div class="flex-none border-t border-default px-6 py-4">
          <div class="flex items-center justify-end gap-2.5">
            <UButton color="neutral" variant="outline" class="rounded-full" @click="emit('update:open', false)">
              Cancel
            </UButton>
            <UButton color="primary" class="rounded-full" :loading="saving" @click="save">
              {{ mode === 'edit' ? 'Save Changes' : 'Add Website' }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
