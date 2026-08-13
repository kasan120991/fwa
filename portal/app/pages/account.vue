<script setup lang="ts">
useHead({ title: 'Account · Francis Web Agency' })
const api = useApi()
const toast = useToast()

interface Account {
  company: string | null
  email: string | null
  login_email: string
  name: string | null
  phone: string | null
  billing_email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
}

const pending = ref(true)
const account = ref<Account | null>(null)
const form = reactive({
  name: '',
  phone: '',
  billing_email: '',
  address_line1: '',
  address_line2: '',
  city: '',
  region: '',
  postal_code: '',
  country: ''
})

const CONTACT_FIELDS = ['name', 'phone', 'billing_email'] as const
const ADDRESS_FIELDS = ['address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country'] as const

function fill(a: Account) {
  form.name = a.name ?? ''
  form.phone = a.phone ?? ''
  form.billing_email = a.billing_email ?? ''
  form.address_line1 = a.address_line1 ?? ''
  form.address_line2 = a.address_line2 ?? ''
  form.city = a.city ?? ''
  form.region = a.region ?? ''
  form.postal_code = a.postal_code ?? ''
  form.country = a.country ?? ''
}

onMounted(async () => {
  try {
    const { data } = await api<{ data: Account }>('/portal/account')
    account.value = data
    fill(data)
  } finally {
    pending.value = false
  }
})

// Per-section saves — the PATCH endpoint skips keys it isn't sent.
const savingContact = ref(false)
const savingAddress = ref(false)
async function saveFields(keys: readonly (keyof typeof form)[], busy: Ref<boolean>, title: string) {
  if (busy.value) return
  busy.value = true
  try {
    const body: Record<string, string | null> = {}
    for (const k of keys) body[k] = form[k].trim() || null
    const { data } = await api<{ data: Account }>('/portal/account', { method: 'PATCH', body })
    account.value = data
    fill(data)
    toast.add({ title, color: 'success' })
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not save', description: e?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    busy.value = false
  }
}

// ---- change password ----
const currentPw = ref('')
const newPw = ref('')
const confirmPw = ref('')
const changing = ref(false)
async function changePassword() {
  if (changing.value) return
  if (newPw.value.length < 8) {
    toast.add({ title: 'Use at least 8 characters for your new password.', color: 'error' })
    return
  }
  if (newPw.value !== confirmPw.value) {
    toast.add({ title: 'Those new passwords don\'t match.', color: 'error' })
    return
  }
  changing.value = true
  try {
    await api('/auth/change-password', { method: 'POST', body: { current_password: currentPw.value, new_password: newPw.value } })
    currentPw.value = ''
    newPw.value = ''
    confirmPw.value = ''
    toast.add({ title: 'Password changed', color: 'success' })
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not change password', description: e?.data?.error?.message || 'Try again.', color: 'error' })
  } finally {
    changing.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div>
      <p class="eyebrow text-primary">
        Your Details
      </p>
      <h1 class="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-tight text-highlighted">
        Account
      </h1>
      <p
        v-if="account"
        class="mt-1.5 text-[0.9375rem] text-muted"
      >
        {{ account.company || account.name }} · signed in as {{ account.login_email }}
      </p>
    </div>

    <div
      v-if="pending"
      class="mt-4 rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Loading…
    </div>

    <template v-else>
      <!-- Contact -->
      <section class="grid gap-x-10 gap-y-4 pt-6 lg:grid-cols-[280px_1fr]">
        <div>
          <h2 class="text-[15px] font-semibold text-highlighted">
            Contact
          </h2>
          <p class="mt-1 text-[12.5px] leading-relaxed text-muted">
            Who we reach out to, and where invoices go. The billing email falls back to your main email when empty.
          </p>
        </div>
        <div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField
              label="Contact Name"
              required
            >
              <UInput
                v-model="form.name"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Phone">
              <UInput
                v-model="form.phone"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Billing Email">
              <UInput
                v-model="form.billing_email"
                type="email"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="mt-4 flex justify-end">
            <UButton
              color="primary"
              :loading="savingContact"
              :disabled="!form.name.trim()"
              @click="saveFields(CONTACT_FIELDS, savingContact, 'Contact updated')"
            >
              Save Changes
            </UButton>
          </div>
        </div>
      </section>

      <!-- Billing address -->
      <section class="mt-6 grid gap-x-10 gap-y-4 border-t border-default pt-7 lg:grid-cols-[280px_1fr]">
        <div>
          <h2 class="text-[15px] font-semibold text-highlighted">
            Billing Address
          </h2>
          <p class="mt-1 text-[12.5px] leading-relaxed text-muted">
            Appears on your invoices.
          </p>
        </div>
        <div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField label="Address Line 1">
              <UInput
                v-model="form.address_line1"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Address Line 2">
              <UInput
                v-model="form.address_line2"
                class="w-full"
              />
            </UFormField>
            <UFormField label="City">
              <UInput
                v-model="form.city"
                class="w-full"
              />
            </UFormField>
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="State / Region">
                <UInput
                  v-model="form.region"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Postal Code">
                <UInput
                  v-model="form.postal_code"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UFormField label="Country">
              <UInput
                v-model="form.country"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="mt-4 flex justify-end">
            <UButton
              color="neutral"
              variant="outline"
              :loading="savingAddress"
              @click="saveFields(ADDRESS_FIELDS, savingAddress, 'Address updated')"
            >
              Save Address
            </UButton>
          </div>
        </div>
      </section>

      <!-- Password -->
      <section class="mt-6 grid gap-x-10 gap-y-4 border-t border-default pt-7 lg:grid-cols-[280px_1fr]">
        <div>
          <h2 class="text-[15px] font-semibold text-highlighted">
            Password
          </h2>
          <p class="mt-1 text-[12.5px] leading-relaxed text-muted">
            At least 8 characters. You'll stay signed in here.
          </p>
        </div>
        <div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <UFormField label="Current Password">
              <UInput
                v-model="currentPw"
                type="password"
                autocomplete="current-password"
                class="w-full"
              />
            </UFormField>
            <UFormField label="New Password">
              <UInput
                v-model="newPw"
                type="password"
                autocomplete="new-password"
                placeholder="At least 8 characters"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Confirm New Password">
              <UInput
                v-model="confirmPw"
                type="password"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="mt-4 flex justify-end">
            <UButton
              color="neutral"
              variant="outline"
              :loading="changing"
              :disabled="!currentPw || !newPw || !confirmPw"
              @click="changePassword"
            >
              Change Password
            </UButton>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
