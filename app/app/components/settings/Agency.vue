<script setup lang="ts">
// Settings → Agency & Branding: FWA's own business identity. Persisted on the
// settings singleton (GET/PATCH /settings) and used on invoices/proposals where
// the platforms allow (footer, billing defaults, PandaDoc tokens).
const api = useApi()
const toast = useToast()
const { upload, resolveUrl } = useUploads()

interface Settings { [k: string]: string | number | null }
const FIELDS = [
  'agency_legal_name', 'agency_display_name', 'agency_support_email', 'agency_phone', 'agency_logo_url',
  'agency_address_line1', 'agency_address_line2', 'agency_city', 'agency_region', 'agency_postal_code', 'agency_country'
] as const

const form = reactive<Record<string, string>>(Object.fromEntries(FIELDS.map(f => [f, ''])))
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const pending = ref(true)
const original = ref('')
const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Australia']

function snapshot() { return JSON.stringify(form) }
async function load() {
  const { data } = await api<{ data: Settings }>('/settings')
  for (const f of FIELDS) form[f] = (data[f] as string) ?? ''
  original.value = snapshot()
  pending.value = false
}
onMounted(load)
const dirty = computed(() => snapshot() !== original.value)

// --- logo upload ---
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
function pickLogo() { fileInput.value?.click() }
async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const res = await upload(file)
    form.agency_logo_url = res.path
  } catch {
    toast.add({ title: "Couldn't upload logo", color: 'error' })
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function save() {
  if (saving.value || !dirty.value) return
  errors.value = {}
  saving.value = true
  try {
    const body: Record<string, string | null> = {}
    for (const f of FIELDS) body[f] = form[f].trim() || null
    await api('/settings', { method: 'PATCH', body })
    original.value = snapshot()
    toast.add({ title: 'Agency details saved', color: 'success' })
  } catch (e: unknown) {
    const err = e as { data?: { error?: { message?: string, fields?: Record<string, string> } } }
    errors.value = err?.data?.error?.fields ?? {}
    toast.add({ title: "Couldn't save agency details", description: err?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Business Details -->
    <section class="rounded-card bg-default p-6 ring ring-default">
      <div class="mb-5">
        <h2 class="text-base font-semibold text-highlighted">
          Business Details
        </h2>
        <p class="mt-1 text-[13.5px] text-muted">
          Shown on invoices, proposals, and the client portal.
        </p>
      </div>

      <div class="mb-5 flex items-center gap-4">
        <span
          v-if="uploading"
          class="flex size-[60px] flex-none items-center justify-center rounded-[14px] bg-muted text-muted ring ring-default"
        >
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        </span>
        <img
          v-else-if="form.agency_logo_url"
          :src="resolveUrl(form.agency_logo_url)"
          alt="Agency logo"
          class="size-[60px] flex-none rounded-[14px] bg-elevated object-contain p-1.5 ring ring-default"
        >
        <button
          v-else
          type="button"
          class="flex size-[60px] flex-none items-center justify-center rounded-[14px] border-[1.5px] border-dashed border-accented text-muted transition-colors hover:border-primary hover:bg-mist hover:text-primary"
          @click="pickLogo"
        >
          <UIcon name="i-lucide-image" class="size-5" />
        </button>
        <div class="flex flex-col gap-1">
          <button type="button" class="text-left text-[13.5px] font-semibold text-primary" @click="pickLogo">
            Upload Logo
          </button>
          <button
            v-if="form.agency_logo_url"
            type="button"
            class="text-left text-[12.5px] text-muted hover:text-error"
            @click="form.agency_logo_url = ''"
          >
            Remove
          </button>
          <span v-else class="text-[12.5px] text-muted">SVG or PNG, transparent background.</span>
        </div>
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFile">
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField label="Legal Name">
          <UInput v-model="form.agency_legal_name" size="lg" class="w-full" placeholder="Francis Web Agency LLC" />
        </UFormField>
        <UFormField label="Display Name">
          <UInput v-model="form.agency_display_name" size="lg" class="w-full" placeholder="Francis Web Agency" />
        </UFormField>
        <UFormField label="Support Email" :error="errors.agency_support_email">
          <UInput v-model="form.agency_support_email" type="email" size="lg" class="w-full" placeholder="hello@franciswebagency.com" />
        </UFormField>
        <UFormField label="Phone">
          <UInput v-model="form.agency_phone" size="lg" class="w-full" />
        </UFormField>
      </div>

      <div class="mt-6 flex justify-end border-t border-default pt-4">
        <UButton :loading="saving" :disabled="!dirty" color="primary" size="lg" @click="save">
          Save Changes
        </UButton>
      </div>
    </section>

    <!-- Business Address -->
    <section class="rounded-card bg-default p-6 ring ring-default">
      <div class="mb-5">
        <h2 class="text-base font-semibold text-highlighted">
          Business Address
        </h2>
        <p class="mt-1 text-[13.5px] text-muted">
          Appears on the documents you send clients.
        </p>
      </div>
      <div class="flex flex-col gap-4">
        <UFormField label="Address Line 1">
          <UInput v-model="form.agency_address_line1" size="lg" class="w-full" />
        </UFormField>
        <UFormField label="Address Line 2">
          <UInput v-model="form.agency_address_line2" size="lg" class="w-full" placeholder="Suite, unit (optional)" />
        </UFormField>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UFormField label="City">
            <UInput v-model="form.agency_city" size="lg" class="w-full" />
          </UFormField>
          <UFormField label="State / Region">
            <UInput v-model="form.agency_region" size="lg" class="w-full" />
          </UFormField>
          <UFormField label="Postal Code">
            <UInput v-model="form.agency_postal_code" size="lg" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Country" class="sm:max-w-xs">
          <USelect v-model="form.agency_country" :items="COUNTRIES" size="lg" class="w-full" placeholder="Select a country" />
        </UFormField>
      </div>
      <div class="mt-6 flex justify-end border-t border-default pt-4">
        <UButton :loading="saving" :disabled="!dirty" color="primary" size="lg" @click="save">
          Save Changes
        </UButton>
      </div>
    </section>
  </div>
</template>
