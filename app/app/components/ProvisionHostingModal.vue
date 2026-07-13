<script setup lang="ts">
// One-click hosting for a project: create a DigitalOcean droplet + linked website
// record (filed under the client's DO Project). POSTs /projects/:id/provision.
interface ProjectRef { id: number, name: string, clientLabel?: string | null }
const props = defineProps<{ open: boolean, project: ProjectRef | null }>()
const emit = defineEmits<{
  'update:open': [boolean]
  'provisioned': [{ website_id: number, monthly_price: number | null, grouped: boolean }]
}>()

const api = useApi()
const toast = useToast()

interface SizeOpt { slug: string, price_monthly: number, vcpus: number, memory: number, disk: number, description: string }
interface RegionOpt { slug: string, name: string }
interface Options { configured: boolean, sizes?: SizeOpt[], regions?: RegionOpt[], defaults?: { region: string, size: string } }

const ENV_ITEMS = [
  { label: 'Staging', value: 'staging' },
  { label: 'Live', value: 'live' },
  { label: 'Dev', value: 'dev' }
]

const options = ref<Options | null>(null)
const loadingOptions = ref(false)
const submitting = ref(false)
const errors = ref<Record<string, string>>({})

const form = reactive({ name: '', domain: '', environment: 'staging', region: '', size: '' })

const sizeItems = computed(() =>
  (options.value?.sizes ?? []).map(s => ({ label: `${s.slug} · ${formatMoney(s.price_monthly)}/mo`, value: s.slug })))
const regionItems = computed(() =>
  (options.value?.regions ?? []).map(r => ({ label: `${r.name} (${r.slug})`, value: r.slug })))
const selectedPrice = computed(() =>
  options.value?.sizes?.find(s => s.slug === form.size)?.price_monthly ?? null)
const configured = computed(() => options.value?.configured === true)

async function loadOptions() {
  loadingOptions.value = true
  try {
    const { data } = await api<{ data: Options }>('/websites/provision-options')
    options.value = data
    if (data.configured) {
      form.region = data.defaults?.region || data.regions?.[0]?.slug || ''
      form.size = data.defaults?.size || data.sizes?.[0]?.slug || ''
    }
  } catch {
    options.value = { configured: false }
  } finally {
    loadingOptions.value = false
  }
}

watch(() => props.open, (o) => {
  if (!o) return
  errors.value = {}
  Object.assign(form, { name: props.project?.name || '', domain: '', environment: 'staging', region: '', size: '' })
  loadOptions()
})

function validate() {
  const e: Record<string, string> = {}
  if (!form.domain.trim()) e.domain = 'A domain is required.'
  if (!form.size) e.size = 'Choose a size.'
  if (!form.region) e.region = 'Choose a region.'
  errors.value = e
  return Object.keys(e).length === 0
}

async function submit() {
  if (submitting.value || !configured.value || !props.project || !validate()) return
  submitting.value = true
  const domain = form.domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  try {
    const { data } = await api<{ data: { provisioned?: boolean, configured?: boolean, error?: string, website_id?: number, monthly_price?: number | null, grouped?: boolean } }>(
      `/projects/${props.project.id}/provision`,
      { method: 'POST', body: { name: form.name.trim() || undefined, domain, environment: form.environment, region: form.region, size: form.size } }
    )
    if (data.provisioned && data.website_id) {
      emit('provisioned', { website_id: data.website_id, monthly_price: data.monthly_price ?? null, grouped: !!data.grouped })
      emit('update:open', false)
    } else {
      toast.add({ title: 'Could not provision hosting', description: data.error || 'Check the details and try again.', color: 'error' })
    }
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not provision hosting', description: e?.data?.error?.message || 'Check the connection and try again.', color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal :open="open" :ui="{ content: 'sm:max-w-xl' }" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="flex max-h-[85vh] flex-col">
        <div class="flex-none border-b border-default px-6 py-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-primary">
                Provision hosting
              </div>
              <h2 class="mt-1 font-display text-[22px] font-medium tracking-tight text-highlighted">
                Launch a DigitalOcean droplet
              </h2>
            </div>
            <UButton icon="i-lucide-x" color="neutral" variant="outline" square size="sm" aria-label="Close" @click="emit('update:open', false)" />
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div v-if="loadingOptions" class="py-6 text-center text-sm text-muted">
            Loading options…
          </div>

          <div v-else-if="!configured" class="flex items-center gap-3 rounded-card bg-muted px-4 py-4 text-[13px] text-muted ring ring-default">
            <UIcon name="i-lucide-plug" class="size-5 flex-none" />
            <span>DigitalOcean isn't connected. Add an API token to provision hosting.</span>
          </div>

          <div v-else class="flex flex-col gap-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Site Name">
                <UInput v-model="form.name" placeholder="Northwind Storefront" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Domain" :required="true" :error="errors.domain">
                <UInput v-model="form.domain" placeholder="northwind.com" size="lg" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Region" :required="true" :error="errors.region">
                <USelect v-model="form.region" :items="regionItems" placeholder="Choose a region…" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Environment">
                <USelect v-model="form.environment" :items="ENV_ITEMS" size="lg" class="w-full" />
              </UFormField>
            </div>

            <UFormField label="Droplet Size" :required="true" :error="errors.size" help="Base droplet cost billed monthly by DigitalOcean.">
              <USelect v-model="form.size" :items="sizeItems" placeholder="Choose a size…" size="lg" class="w-full" />
            </UFormField>

            <div class="flex items-center gap-3 rounded-card bg-mist px-4 py-3 text-[13px] ring ring-default">
              <UIcon name="i-lucide-server-cog" class="size-5 flex-none text-primary" />
              <span class="text-default">
                This creates a live droplet in your DigitalOcean account
                <template v-if="selectedPrice != null"> — <span class="font-semibold text-highlighted">{{ formatMoney(selectedPrice) }}/mo</span></template>.
                It's filed under {{ project?.clientLabel || 'the client' }}'s DigitalOcean Project.
              </span>
            </div>
          </div>
        </div>

        <div class="flex-none border-t border-default px-6 py-4">
          <div class="flex items-center justify-end gap-2.5">
            <UButton color="neutral" variant="outline" class="rounded-full" @click="emit('update:open', false)">
              Cancel
            </UButton>
            <UButton color="primary" class="rounded-full" :disabled="!configured" :loading="submitting" icon="i-lucide-server-cog" @click="submit">
              {{ selectedPrice != null ? `Create droplet · ${formatMoney(selectedPrice)}/mo` : 'Create droplet' }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
