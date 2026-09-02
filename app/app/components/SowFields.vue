<script setup lang="ts">
// The Statement of Work form. Lifted verbatim out of ProjectForm, where it sat
// behind `v-if="mode === 'edit'"`, because the SOW belongs to the proposal now —
// it's what the client is being asked to agree to. ProjectForm keeps only the
// delivery half (name, type, status, template).
//
// Deliberately uncontrolled about layout: the parent supplies the card, this
// supplies the fields, so the proposal form and any future scope editor stay
// identical rather than diverging by a stray margin.
//
// SowState / blankSow live in utils/sow.ts (auto-imported) because a
// `<script setup>` block can't export.

const form = defineModel<SowState>({ required: true })

const CONTENT_BY_ITEMS = [
  { label: 'Client', value: 'client' },
  { label: 'Developer', value: 'developer' },
  { label: 'Mix', value: 'mix' }
]

const showPolicy = ref(false)

const money = (n: number | null) =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const deposit = computed(() => {
  const fee = form.value.project_fee
  if (fee == null) return null
  return Math.round((fee * (form.value.deposit_pct || 0) / 100) * 100) / 100
})
const balance = computed(() => {
  const fee = form.value.project_fee
  if (fee == null || deposit.value == null) return null
  return Math.round((fee - deposit.value) * 100) / 100
})
</script>

<template>
  <div class="space-y-4">
    <!-- Scope -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UFormField label="Pages Included">
        <UTextarea
          v-model="form.pages_included"
          :rows="2"
          autoresize
          placeholder="Home, About, Services, Contact"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Key Features">
        <UTextarea
          v-model="form.key_features"
          :rows="2"
          autoresize
          placeholder="Contact form, gallery, booking, blog"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Design Deliverables">
        <UTextarea
          v-model="form.design_deliverables"
          :rows="2"
          autoresize
          placeholder="Custom design, mobile-responsive, brand colors"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Third-Party Costs">
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
      <UFormField label="Content Provided By">
        <USelect
          v-model="form.content_provided_by"
          :items="CONTENT_BY_ITEMS"
          placeholder="Select…"
          size="lg"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Revision Rounds Included">
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
        <UFormField label="Project Fee (Total)">
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
        <UFormField label="Hourly Rate (Extra Work)">
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
      <UFormField label="Content Deadline">
        <UInput
          v-model="form.content_deadline"
          type="date"
          size="lg"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Start Date">
        <UInput
          v-model="form.start_date"
          type="date"
          size="lg"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Target Launch">
        <UInput
          v-model="form.target_launch_date"
          type="date"
          size="lg"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField label="Special Terms / Notes">
      <UTextarea
        v-model="form.special_terms"
        :rows="2"
        autoresize
        placeholder="Anything specific to this engagement."
        class="w-full"
      />
    </UFormField>

    <!-- Policy Terms — the bracketed placeholders in the agreement body. Rarely
         touched, so collapsed by default. -->
    <div class="rounded-card ring ring-default">
      <button
        type="button"
        class="flex w-full items-center justify-between px-4 py-3 text-left"
        @click="showPolicy = !showPolicy"
      >
        <span class="text-[13.5px] font-semibold text-highlighted">Policy Terms</span>
        <UIcon
          :name="showPolicy ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="size-4 text-muted"
        />
      </button>
      <div
        v-if="showPolicy"
        class="grid grid-cols-2 gap-4 border-t border-default px-4 py-4 sm:grid-cols-4"
      >
        <UFormField label="Inactivity (Days)">
          <UInput
            v-model.number="form.inactivity_days"
            type="number"
            min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Feedback (Days)">
          <UInput
            v-model.number="form.feedback_days"
            type="number"
            min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Late (Days)">
          <UInput
            v-model.number="form.late_fee_days"
            type="number"
            min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Bug-Fix (Days)">
          <UInput
            v-model.number="form.bugfix_days"
            type="number"
            min="0"
            class="w-full"
          />
        </UFormField>
      </div>
    </div>
  </div>
</template>
