<script setup lang="ts">
// Settings → Preferences: admin notification opt-outs (gated in notify()),
// billing defaults (used on new invoices), and appearance (client-only theme).
const api = useApi()
const toast = useToast()
const colorMode = useColorMode()

// Notification categories the admin can mute. Keys are the notify() `category`.
const NOTIF: { key: string, label: string, desc: string }[] = [
  { key: 'lead', label: 'New Leads', desc: 'A contact form or manual lead comes in.' },
  { key: 'payment', label: 'Payments Received', desc: 'A client completes a payment.' },
  { key: 'invoice', label: 'Invoice Activity', desc: 'An invoice is issued, voided, or a payment fails.' },
  { key: 'ticket', label: 'Support Tickets', desc: 'A client opens or replies to a ticket.' },
  { key: 'proposal', label: 'Proposals', desc: 'A proposal is viewed, accepted, or declined.' },
  { key: 'contract', label: 'Contracts', desc: 'A contract is signed or declined.' },
  { key: 'call', label: 'Receptionist Calls', desc: 'The AI receptionist logs a call.' },
  { key: 'expense', label: 'Subscription Renewals', desc: 'A recurring cost is about to renew.' },
  { key: 'website', label: 'Website & Uptime', desc: 'A site goes down or recovers.' }
]

const enabled = reactive<Record<string, boolean>>(Object.fromEntries(NOTIF.map(n => [n.key, true])))
const billing = reactive({ invoice_due_days: 7, invoice_currency: 'USD' })
const DUE_OPTIONS = [
  { label: 'Due in 7 days', value: 7 },
  { label: 'Due in 14 days', value: 14 },
  { label: 'Due in 30 days', value: 30 },
  { label: 'Due on receipt', value: 1 }
]
const CURRENCIES = ['USD', 'CAD', 'GBP', 'AUD', 'EUR']
const savingNotif = ref(false)
const savingBilling = ref(false)
const original = ref('')

function snapshot() { return JSON.stringify({ enabled, billing }) }
onMounted(async () => {
  const { data } = await api<{ data: { notification_prefs: Record<string, boolean> | null, invoice_due_days: number, invoice_currency: string } }>('/settings')
  const prefs = data.notification_prefs || {}
  for (const n of NOTIF) enabled[n.key] = prefs[n.key] !== false
  billing.invoice_due_days = data.invoice_due_days ?? 7
  billing.invoice_currency = data.invoice_currency ?? 'USD'
  original.value = snapshot()
})

async function saveNotifs() {
  savingNotif.value = true
  try {
    await api('/settings', { method: 'PATCH', body: { notification_prefs: { ...enabled } } })
    original.value = snapshot()
    toast.add({ title: 'Notification preferences saved', color: 'success' })
  } catch {
    toast.add({ title: "Couldn't save preferences", color: 'error' })
  } finally {
    savingNotif.value = false
  }
}
async function saveBilling() {
  savingBilling.value = true
  try {
    await api('/settings', { method: 'PATCH', body: { invoice_due_days: billing.invoice_due_days, invoice_currency: billing.invoice_currency } })
    original.value = snapshot()
    toast.add({ title: 'Billing defaults saved', color: 'success' })
  } catch {
    toast.add({ title: "Couldn't save billing defaults", color: 'error' })
  } finally {
    savingBilling.value = false
  }
}

const THEMES = ['system', 'light', 'dark']
function setTheme(t: string) { colorMode.preference = t }
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Notifications -->
    <section class="rounded-card bg-default p-6 ring ring-default">
      <div class="mb-2 flex items-start justify-between gap-4">
        <div>
          <h2 class="text-base font-semibold text-highlighted">
            Notifications
          </h2>
          <p class="mt-1 text-[13.5px] text-muted">
            Choose what raises an alert in the bell.
          </p>
        </div>
        <UButton :loading="savingNotif" color="primary" size="sm" @click="saveNotifs">
          Save Changes
        </UButton>
      </div>
      <div class="flex flex-col">
        <div
          v-for="n in NOTIF"
          :key="n.key"
          class="flex items-center justify-between gap-4 border-b border-default py-3 last:border-0"
        >
          <div class="min-w-0">
            <div class="text-sm font-medium text-highlighted">
              {{ n.label }}
            </div>
            <div class="mt-0.5 text-[12.5px] text-muted">
              {{ n.desc }}
            </div>
          </div>
          <USwitch v-model="enabled[n.key]" />
        </div>
      </div>
    </section>

    <!-- Billing Defaults -->
    <section class="rounded-card bg-default p-6 ring ring-default">
      <div class="mb-5">
        <h2 class="text-base font-semibold text-highlighted">
          Billing Defaults
        </h2>
        <p class="mt-1 text-[13.5px] text-muted">
          Applied to new invoices.
        </p>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField label="Default Payment Terms">
          <USelect v-model="billing.invoice_due_days" :items="DUE_OPTIONS" size="lg" class="w-full" />
        </UFormField>
        <UFormField label="Currency">
          <USelect v-model="billing.invoice_currency" :items="CURRENCIES" size="lg" class="w-full" />
        </UFormField>
      </div>
      <div class="mt-6 flex justify-end border-t border-default pt-4">
        <UButton :loading="savingBilling" color="primary" size="lg" @click="saveBilling">
          Save Changes
        </UButton>
      </div>
    </section>

    <!-- Appearance -->
    <section class="rounded-card bg-default p-6 ring ring-default">
      <div class="mb-5">
        <h2 class="text-base font-semibold text-highlighted">
          Appearance
        </h2>
        <p class="mt-1 text-[13.5px] text-muted">
          Applies to this device.
        </p>
      </div>
      <div class="inline-flex gap-1 rounded-full bg-elevated p-1 ring ring-default">
        <button
          v-for="t in THEMES"
          :key="t"
          type="button"
          class="rounded-lg px-4 py-1.5 text-[13px] font-semibold capitalize transition-colors"
          :class="colorMode.preference === t ? 'bg-default text-highlighted shadow-sm' : 'text-muted'"
          @click="setTheme(t)"
        >
          {{ t }}
        </button>
      </div>
    </section>
  </div>
</template>
