<script setup lang="ts">
// Assign a care plan to a client. Picks a tier from the price book (Settings →
// Price Book), lets the price be overridden, sets the start date, and decides
// whether a signed agreement comes first. Submits POST /api/care-plans; the
// server snapshots the tier so later price-book edits don't touch this plan.
import type { CarePlan } from '~/utils/carePlans'

const props = defineProps<{
  open: boolean
  clientId?: number | null
  clientLabel?: string | null
}>()
const emit = defineEmits<{ 'update:open': [boolean], 'saved': [CarePlan] }>()

const api = useApi()
const toast = useToast()

interface Tier { id: number, name: string, description: string | null, price: number, is_active: boolean }

const tiers = ref<Tier[]>([])
const clients = ref<{ label: string, value: number }[]>([])
const agreementTemplate = ref(false)
const loading = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const today = () => new Date().toISOString().slice(0, 10)
const form = reactive({
  client_id: props.clientId ?? (undefined as number | undefined),
  service_id: undefined as number | undefined,
  name: '',
  price: '' as string | number,
  description: '',
  start_date: today(),
  requires_agreement: false
})

const tierItems = computed(() => [
  ...tiers.value.map(t => ({ label: `${t.name} — ${formatMoney(t.price)}/mo`, value: t.id })),
  { label: 'Custom plan', value: 0 }
])

// Picking a tier prefills the editable fields; "Custom" clears them.
watch(() => form.service_id, (id) => {
  const tier = tiers.value.find(t => t.id === id)
  if (tier) {
    form.name = tier.name
    form.price = tier.price
    form.description = tier.description ?? ''
  } else if (id === 0) {
    form.name = ''
    form.price = ''
    form.description = ''
  }
})

async function load() {
  loading.value = true
  try {
    const [t, r] = await Promise.all([
      api<{ data: Tier[] }>('/services', { query: { category: 'care_plan', active: 1 } }),
      api<{ data: { agreement_template: boolean } }>('/care-plans/readiness')
    ])
    tiers.value = t.data
    agreementTemplate.value = r.data.agreement_template
    if (!props.clientId && !clients.value.length) {
      const { data } = await api<{ data: { id: number, company: string | null, name: string }[] }>('/clients', { query: { limit: 200 } })
      clients.value = data.map(c => ({ label: c.company || c.name, value: c.id }))
    }
    if (tiers.value.length && form.service_id === undefined) form.service_id = tiers.value[0]!.id
    else if (!tiers.value.length) form.service_id = 0
  } catch {
    toast.add({ title: 'Could not load care plan tiers', color: 'error' })
  } finally {
    loading.value = false
  }
}

watch(() => props.open, (v) => {
  if (!v) return
  errors.value = {}
  form.client_id = props.clientId ?? undefined
  form.service_id = undefined
  form.name = ''
  form.price = ''
  form.description = ''
  form.start_date = today()
  form.requires_agreement = false
  load()
}, { immediate: true })

const valid = computed(() => !!form.client_id && !!form.name.trim() && Number(form.price) > 0 && !!form.start_date)

async function submit() {
  if (!valid.value || saving.value) return
  saving.value = true
  errors.value = {}
  try {
    const { data } = await api<{ data: CarePlan }>('/care-plans', {
      method: 'POST',
      body: {
        client_id: form.client_id,
        service_id: form.service_id || null,
        name: form.name.trim(),
        price: Number(form.price),
        description: form.description.trim() || null,
        start_date: form.start_date,
        requires_agreement: form.requires_agreement
      }
    })
    toast.add({
      title: 'Care plan assigned',
      description: form.requires_agreement ? 'Send the agreement when you’re ready.' : 'Send the client a link to add their card.',
      color: 'success'
    })
    emit('saved', data)
    emit('update:open', false)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string, fields?: Record<string, string> } } }
    errors.value = e?.data?.error?.fields ?? {}
    toast.add({ title: 'Could not assign the plan', description: e?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}
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
              <div class="eyebrow">
                Recurring
              </div>
              <h2 class="mt-1 font-display text-[22px] font-semibold tracking-tight text-highlighted">
                New Care Plan
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
          <div class="flex flex-col gap-5">
            <UFormField
              label="Client"
              required
              :error="errors.client_id"
            >
              <UInput
                v-if="clientId"
                :model-value="clientLabel || ''"
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

            <UFormField
              label="Plan"
              required
              :hint="tiers.length ? undefined : 'No tiers yet — add them under Settings → Price Book'"
            >
              <USelect
                v-model="form.service_id"
                :items="tierItems"
                :loading="loading"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
              <UFormField
                label="Name"
                required
                :error="errors.name"
              >
                <UInput
                  v-model="form.name"
                  placeholder="Care Plan — Essential"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Price / Month"
                required
                :error="errors.price"
              >
                <UInput
                  v-model="form.price"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="99"
                  size="lg"
                  class="w-full"
                >
                  <template #leading>
                    <span class="text-sm text-muted">$</span>
                  </template>
                </UInput>
              </UFormField>
            </div>

            <UFormField
              label="What's Included"
              hint="One item per line; shows on the portal and the agreement"
            >
              <UTextarea
                v-model="form.description"
                :rows="4"
                autoresize
                placeholder="Hosting, SSL and daily backups&#10;Plugin and core updates&#10;Uptime monitoring"
                class="w-full"
              />
            </UFormField>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField
                label="Start Date"
                required
                hint="Billed on this day each month"
                :error="errors.start_date"
              >
                <UInput
                  v-model="form.start_date"
                  type="date"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Agreement"
                :hint="agreementTemplate ? 'Signed before billing starts' : 'No care-plan template in PandaDoc yet'"
              >
                <div class="flex h-11 items-center">
                  <UCheckbox
                    v-model="form.requires_agreement"
                    :disabled="!agreementTemplate"
                    label="Require a signed agreement"
                  />
                </div>
              </UFormField>
            </div>

            <p class="rounded-card bg-sand px-4 py-3 text-[13px] leading-relaxed text-muted">
              <template v-if="form.requires_agreement">
                The client signs the agreement first, then adds a card in the portal. Billing starts on the start date once both are done.
              </template>
              <template v-else>
                The client adds a card in the portal; billing starts on the start date and repeats monthly. Nothing is charged until then.
              </template>
            </p>
          </div>
        </div>

        <div class="flex flex-none items-center justify-end gap-3 border-t border-default px-6 py-4">
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
            :disabled="!valid"
            @click="submit"
          >
            Assign Plan
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
