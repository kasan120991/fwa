<script setup lang="ts">
// Settings → Price Book: the services catalogue. Care-plan tiers come first —
// they're what the New Care Plan form offers — then website packages and
// add-ons for proposals. CRUD via /api/services. A plan already assigned to a
// client keeps its own snapshot, so editing a tier here never re-prices it.
const api = useApi()
const toast = useToast()

type Category = 'care_plan' | 'website_package' | 'addon'
type Interval = 'one_time' | 'monthly'
interface Service {
  id: number
  name: string
  description: string | null
  category: Category
  price: number
  billing_interval: Interval
  is_active: boolean
  sort_order: number
}
interface Editor {
  id: number | null
  name: string
  description: string
  category: Category
  price: string | number
  billing_interval: Interval
  is_active: boolean
  sort_order: number
}

const CATEGORIES: { key: Category, label: string, blurb: string, icon: string }[] = [
  { key: 'care_plan', label: 'Care Plans', blurb: 'Monthly tiers a client can be assigned. Hosting, updates, monitoring, support hours.', icon: 'i-lucide-heart-pulse' },
  { key: 'website_package', label: 'Website Packages', blurb: 'Fixed-fee builds that proposals can itemise.', icon: 'i-lucide-layout-template' },
  { key: 'addon', label: 'Add-ons', blurb: 'One-off extras: copywriting, photography, integrations.', icon: 'i-lucide-puzzle' }
]
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label])) as Record<Category, string>

const rows = ref<Service[]>([])
const pending = ref(true)
const saving = ref(false)
const editing = ref<Editor | null>(null)
const errors = ref<Record<string, string>>({})

async function load() {
  pending.value = true
  try {
    const { data } = await api<{ data: Service[] }>('/services', { query: { sort: 'sort_order' } })
    rows.value = data
  } catch {
    toast.add({ title: 'Couldn’t load the price book', color: 'error' })
  } finally {
    pending.value = false
  }
}
onMounted(load)

const grouped = computed(() => CATEGORIES.map(c => ({ ...c, items: rows.value.filter(r => r.category === c.key) })))

function startNew(category: Category = 'care_plan') {
  errors.value = {}
  editing.value = {
    id: null, name: '', description: '', category,
    price: '', billing_interval: category === 'care_plan' ? 'monthly' : 'one_time',
    is_active: true, sort_order: rows.value.filter(r => r.category === category).length + 1
  }
}
function startEdit(row: Service) {
  errors.value = {}
  editing.value = { ...row, description: row.description ?? '' }
}
function cancel() {
  editing.value = null
}

// Care plans are monthly by definition; the interval follows the category.
watch(() => editing.value?.category, (c) => {
  if (editing.value && c === 'care_plan') editing.value.billing_interval = 'monthly'
})

const valid = computed(() => !!editing.value && !!editing.value.name.trim() && Number(editing.value.price) >= 0 && editing.value.price !== '')

async function save() {
  const e = editing.value
  if (!e || !valid.value || saving.value) return
  saving.value = true
  errors.value = {}
  const body = {
    name: e.name.trim(),
    description: e.description.trim() || null,
    category: e.category,
    price: Number(e.price),
    billing_interval: e.category === 'care_plan' ? 'monthly' : e.billing_interval,
    is_active: e.is_active,
    sort_order: Number(e.sort_order) || 0
  }
  try {
    if (e.id) await api(`/services/${e.id}`, { method: 'PATCH', body })
    else await api('/services', { method: 'POST', body })
    toast.add({ title: e.id ? 'Saved' : 'Added to the price book', color: 'success' })
    editing.value = null
    await load()
  } catch (err: unknown) {
    const x = err as { data?: { error?: { message?: string, fields?: Record<string, string> } } }
    errors.value = x?.data?.error?.fields ?? {}
    toast.add({ title: 'Could not save', description: x?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function remove(row: Service) {
  if (!confirm(`Delete “${row.name}” from the price book? Plans already assigned keep their own copy.`)) return
  try {
    await api(`/services/${row.id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', color: 'neutral' })
    await load()
  } catch (err: unknown) {
    const x = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not delete', description: x?.data?.error?.message || 'Try again.', color: 'error' })
  }
}

async function toggleActive(row: Service) {
  try {
    await api(`/services/${row.id}`, { method: 'PATCH', body: { is_active: !row.is_active } })
    await load()
  } catch {
    toast.add({ title: 'Could not update', color: 'error' })
  }
}

const priceLabel = (r: Service) => `${formatMoney(r.price)}${r.billing_interval === 'monthly' ? '/mo' : ''}`
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- ===== list ===== -->
    <template v-if="!editing">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-highlighted">
            Price Book
          </h2>
          <p class="mt-1 text-[13.5px] text-muted">
            What you sell, at what price. Care-plan tiers feed the New Care Plan form; packages and add-ons feed proposals.
          </p>
        </div>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="lg"
          class="flex-none"
          @click="startNew('care_plan')"
        >
          New Entry
        </UButton>
      </div>

      <div
        v-if="pending"
        class="flex items-center justify-center rounded-card bg-default py-12 text-muted ring ring-default"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 animate-spin"
        />
      </div>

      <section
        v-for="g in grouped"
        v-else
        :key="g.key"
        class="overflow-hidden rounded-card bg-default ring ring-default"
      >
        <div class="flex items-center justify-between gap-3 px-6 py-5">
          <div>
            <div class="flex items-center gap-2.5">
              <UIcon
                :name="g.icon"
                class="size-[18px] text-muted"
              />
              <span class="text-[15px] font-semibold text-highlighted">{{ g.label }}</span>
              <span class="text-[12.5px] text-muted tabular-nums">{{ g.items.length }}</span>
            </div>
            <p class="mt-1 text-[13px] text-muted">
              {{ g.blurb }}
            </p>
          </div>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-plus"
            @click="startNew(g.key)"
          >
            Add
          </UButton>
        </div>
        <div
          v-if="!g.items.length"
          class="border-t border-default px-6 py-6 text-[13px] text-muted"
        >
          Nothing here yet.
        </div>
        <div
          v-for="row in g.items"
          :key="row.id"
          class="flex items-center gap-4 border-t border-default px-6 py-3.5"
          :class="row.is_active ? '' : 'opacity-60'"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-highlighted">{{ row.name }}</span>
              <StatusChip
                v-if="!row.is_active"
                status="neutral"
              >
                Inactive
              </StatusChip>
            </div>
            <div
              v-if="row.description"
              class="mt-0.5 truncate text-[12.5px] text-muted"
            >
              {{ row.description }}
            </div>
          </div>
          <span class="text-sm font-semibold text-highlighted tabular-nums">{{ priceLabel(row) }}</span>
          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              aria-label="Edit"
              @click="startEdit(row)"
            />
            <UDropdownMenu
              :items="[[
                { label: row.is_active ? 'Mark Inactive' : 'Mark Active', icon: row.is_active ? 'i-lucide-eye-off' : 'i-lucide-eye', onSelect: () => toggleActive(row) }
              ], [
                { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(row) }
              ]]"
            >
              <UButton
                icon="i-lucide-ellipsis"
                color="neutral"
                variant="ghost"
                size="sm"
                square
                aria-label="More"
              />
            </UDropdownMenu>
          </div>
        </div>
      </section>
    </template>

    <!-- ===== editor ===== -->
    <section
      v-else
      class="rounded-card bg-default p-6 ring ring-default"
    >
      <div class="mb-5 flex items-start justify-between gap-3">
        <div>
          <div class="eyebrow">
            {{ CATEGORY_LABEL[editing.category] }}
          </div>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            {{ editing.id ? 'Edit Entry' : 'New Entry' }}
          </h2>
        </div>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="outline"
          square
          size="sm"
          aria-label="Close"
          @click="cancel"
        />
      </div>

      <div class="flex flex-col gap-5">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_200px]">
          <UFormField
            label="Name"
            required
            :error="errors.name"
          >
            <UInput
              v-model="editing.name"
              placeholder="Care Plan — Essential"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Category"
            required
          >
            <USelect
              v-model="editing.category"
              :items="CATEGORIES.map(c => ({ label: c.label, value: c.key }))"
              size="lg"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          label="What's Included"
          hint="One item per line; care plans show this on the portal and the agreement"
        >
          <UTextarea
            v-model="editing.description"
            :rows="4"
            autoresize
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UFormField
            label="Price"
            required
            :error="errors.price"
          >
            <UInput
              v-model="editing.price"
              type="number"
              min="0"
              step="1"
              size="lg"
              class="w-full"
            >
              <template #leading>
                <span class="text-sm text-muted">$</span>
              </template>
            </UInput>
          </UFormField>
          <UFormField
            label="Billing"
            :hint="editing.category === 'care_plan' ? 'Care plans bill monthly' : undefined"
          >
            <USelect
              v-model="editing.billing_interval"
              :items="[{ label: 'One-time', value: 'one_time' }, { label: 'Monthly', value: 'monthly' }]"
              :disabled="editing.category === 'care_plan'"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Sort Order"
            hint="Lower shows first"
          >
            <UInput
              v-model="editing.sort_order"
              type="number"
              min="0"
              step="1"
              size="lg"
              class="w-full"
            />
          </UFormField>
        </div>

        <UCheckbox
          v-model="editing.is_active"
          label="Active (offered in forms)"
        />

        <div class="flex items-center justify-end gap-3 border-t border-default pt-5">
          <UButton
            color="neutral"
            variant="ghost"
            @click="cancel"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="saving"
            :disabled="!valid"
            @click="save"
          >
            {{ editing.id ? 'Save Changes' : 'Add To Price Book' }}
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>
