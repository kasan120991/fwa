<script setup lang="ts">
// The public proposal page: what a prospect opens from the email to accept or
// decline. No login — the portal is invite-only and someone who hasn't bought
// anything yet has no account, so a capability link is the only thing that
// works for the case this whole flow exists to serve.
//
// The token is in the URL but is sent to the API as a HEADER. The server logs
// every request URL, so a token in the path would sit in the application log in
// plaintext and anyone with log access could accept any live proposal.

definePageMeta({ layout: false })

const route = useRoute()
const config = useRuntimeConfig()
const token = String(route.params.token || '')

interface Item { name: string, description: string | null, unit_price: number, qty: number, line_total: number }
interface View {
  decided: boolean
  status?: string
  code: string | null
  title: string
  currency: string
  total: number
  goals: string | null
  pages_included: string | null
  key_features: string | null
  design_deliverables: string | null
  content_provided_by: string | null
  revision_rounds: number
  project_fee: number | null
  deposit_pct: number
  start_date: string | null
  target_launch_date: string | null
  special_terms: string | null
  items: Item[]
  client: { name: string }
  agency: { name: string, email: string | null, logo_url: string | null }
}

const proposal = ref<View | null>(null)
const loadError = ref('')
const pending = ref(true)
const busy = ref<'accept' | 'decline' | null>(null)
const outcome = ref<'accepted' | 'declined' | null>(null)
const yourName = ref('')
const declineReason = ref('')
const declining = ref(false)

const base = String(config.public.apiBase || '').replace(/\/$/, '')
function call<T>(path: string, opts: Record<string, unknown> = {}) {
  return $fetch<T>(`${base}/public/proposals/self${path}`, {
    ...opts,
    headers: { 'X-Proposal-Token': token }
  })
}

async function load() {
  try {
    const { data } = await call<{ data: View }>('')
    proposal.value = data
    if (data.decided) outcome.value = (data.status === 'accepted' ? 'accepted' : 'declined')
  } catch (err: unknown) {
    loadError.value = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      || 'This link is no longer valid.'
  } finally {
    pending.value = false
  }
}
onMounted(load)

useHead(() => ({ title: proposal.value ? `${proposal.value.title} · Proposal` : 'Proposal' }))

async function accept() {
  busy.value = 'accept'
  try {
    await call('/accept', { method: 'POST', body: { name: yourName.value } })
    outcome.value = 'accepted'
  } catch (err: unknown) {
    loadError.value = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      || 'Something went wrong. Please get in touch.'
  } finally { busy.value = null }
}

async function decline() {
  busy.value = 'decline'
  try {
    await call('/decline', { method: 'POST', body: { reason: declineReason.value } })
    outcome.value = 'declined'
  } catch (err: unknown) {
    loadError.value = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      || 'Something went wrong. Please get in touch.'
  } finally { busy.value = null }
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const longDate = (d: string | null) => {
  if (!d) return null
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, day!)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}
const deposit = computed(() => {
  const p = proposal.value
  if (!p?.project_fee) return null
  return Math.round((p.project_fee * p.deposit_pct / 100) * 100) / 100
})
const balance = computed(() => {
  const p = proposal.value
  if (!p?.project_fee || deposit.value == null) return null
  return Math.round((p.project_fee - deposit.value) * 100) / 100
})
const CONTENT_BY: Record<string, string> = { client: 'Client', developer: 'Us', mix: 'Shared' }

/** The scope blocks, skipping any the proposal didn't fill in. */
const scope = computed(() => {
  const p = proposal.value
  if (!p) return []
  return [
    { label: 'Pages Included', value: p.pages_included },
    { label: 'Key Features', value: p.key_features },
    { label: 'Design Deliverables', value: p.design_deliverables }
  ].filter(s => s.value)
})
</script>

<template>
  <div class="min-h-screen bg-muted px-4 py-10 sm:py-16">
    <div class="mx-auto w-full max-w-3xl">
      <div
        v-if="pending"
        class="rounded-card bg-default p-10 text-center text-sm text-muted ring ring-default"
      >
        Loading…
      </div>

      <!-- Dead, expired or already-used link. One message for all three, so it
           can't be used to probe which tokens are real. -->
      <div
        v-else-if="loadError && !proposal"
        class="rounded-card bg-default p-10 text-center ring ring-default"
      >
        <UIcon
          name="i-lucide-link-2-off"
          class="size-8 text-muted"
        />
        <h1 class="mt-4 font-display text-xl font-semibold text-highlighted">
          This link is no longer valid
        </h1>
        <p class="mt-2 text-sm text-muted">
          It may have expired, or the proposal has already been decided. Get in touch and we'll send a fresh one.
        </p>
      </div>

      <template v-else-if="proposal">
        <!-- Decided: either it already was, or we just decided it. -->
        <div
          v-if="outcome"
          class="rounded-card bg-default p-10 text-center ring ring-default"
        >
          <UIcon
            :name="outcome === 'accepted' ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
            class="size-9"
            :class="outcome === 'accepted' ? 'text-success' : 'text-muted'"
          />
          <h1 class="mt-4 font-display text-2xl font-semibold tracking-tight text-highlighted">
            {{ outcome === 'accepted' ? 'Thank you — accepted' : 'Proposal declined' }}
          </h1>
          <p class="mx-auto mt-3 max-w-md text-sm text-muted">
            <template v-if="outcome === 'accepted'">
              We're preparing your agreement now. It'll arrive by email shortly for signature.
            </template>
            <template v-else>
              Thanks for letting us know. If anything changes, just reply to our email.
            </template>
          </p>
          <p
            v-if="proposal.agency.email"
            class="mt-6 text-[13px] text-muted"
          >
            Questions? <a
              :href="`mailto:${proposal.agency.email}`"
              class="font-medium text-primary underline underline-offset-2"
            >{{ proposal.agency.email }}</a>
          </p>
        </div>

        <template v-else>
          <!-- header -->
          <div class="flex items-center justify-between gap-4">
            <div class="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
              {{ proposal.agency.name }}
            </div>
            <div
              v-if="proposal.code"
              class="text-[13px] text-muted tabular-nums"
            >
              {{ proposal.code }}
            </div>
          </div>

          <div class="mt-4 rounded-card bg-default p-6 ring ring-default sm:p-8">
            <div class="text-[13px] text-muted">
              Prepared for {{ proposal.client.name }}
            </div>
            <h1 class="mt-1.5 font-display text-[28px] font-semibold leading-tight tracking-tight text-highlighted">
              {{ proposal.title }}
            </h1>
            <p
              v-if="proposal.goals"
              class="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-default"
            >
              {{ proposal.goals }}
            </p>

            <!-- scope -->
            <div
              v-if="scope.length"
              class="mt-8 space-y-5 border-t border-default pt-6"
            >
              <div
                v-for="s in scope"
                :key="s.label"
              >
                <h2 class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
                  {{ s.label }}
                </h2>
                <p class="mt-1.5 whitespace-pre-line text-[14.5px] leading-relaxed text-default">
                  {{ s.value }}
                </p>
              </div>
            </div>

            <!-- terms -->
            <dl class="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-default pt-6 sm:grid-cols-4">
              <div v-if="proposal.content_provided_by">
                <dt class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Content By
                </dt>
                <dd class="mt-1 text-sm text-highlighted">
                  {{ CONTENT_BY[proposal.content_provided_by] ?? proposal.content_provided_by }}
                </dd>
              </div>
              <div>
                <dt class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Revisions
                </dt>
                <dd class="mt-1 text-sm text-highlighted">
                  {{ proposal.revision_rounds }} rounds
                </dd>
              </div>
              <div v-if="proposal.start_date">
                <dt class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Start
                </dt>
                <dd class="mt-1 text-sm text-highlighted">
                  {{ longDate(proposal.start_date) }}
                </dd>
              </div>
              <div v-if="proposal.target_launch_date">
                <dt class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
                  Target Launch
                </dt>
                <dd class="mt-1 text-sm text-highlighted">
                  {{ longDate(proposal.target_launch_date) }}
                </dd>
              </div>
            </dl>

            <!-- money -->
            <div class="mt-8 rounded-card bg-muted p-5 ring ring-default">
              <div class="flex items-baseline justify-between gap-4">
                <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">Project Fee</span>
                <span class="font-display text-[30px] font-semibold leading-none tracking-tight text-highlighted tabular-nums">
                  {{ money(proposal.project_fee ?? proposal.total) }}
                </span>
              </div>
              <div
                v-if="deposit != null"
                class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted"
              >
                <span>{{ proposal.deposit_pct }}% deposit to begin: <span class="font-semibold text-highlighted tabular-nums">{{ money(deposit) }}</span></span>
                <span>Balance on completion: <span class="font-semibold text-highlighted tabular-nums">{{ money(balance) }}</span></span>
              </div>
              <ul
                v-if="proposal.items.length"
                class="mt-4 space-y-1.5 border-t border-default pt-4"
              >
                <li
                  v-for="(i, idx) in proposal.items"
                  :key="idx"
                  class="flex items-baseline justify-between gap-4 text-[13.5px]"
                >
                  <span class="text-default">{{ i.name }}<span
                    v-if="i.qty > 1"
                    class="text-muted"
                  > × {{ i.qty }}</span></span>
                  <span class="flex-none font-medium text-highlighted tabular-nums">{{ money(i.line_total) }}</span>
                </li>
              </ul>
            </div>

            <div
              v-if="proposal.special_terms"
              class="mt-6"
            >
              <h2 class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
                Notes
              </h2>
              <p class="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-muted">
                {{ proposal.special_terms }}
              </p>
            </div>
          </div>

          <!-- decision -->
          <div class="mt-5 rounded-card bg-default p-6 ring ring-default sm:p-8">
            <h2 class="font-display text-lg font-semibold text-highlighted">
              Ready to go ahead?
            </h2>
            <p class="mt-1.5 text-sm text-muted">
              Accepting sends you an agreement to sign — nothing is charged yet.
            </p>

            <UAlert
              v-if="loadError"
              class="mt-4"
              icon="i-lucide-triangle-alert"
              color="error"
              variant="soft"
              :description="loadError"
            />

            <div
              v-if="!declining"
              class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <UFormField
                label="Your name"
                class="flex-1"
              >
                <UInput
                  v-model="yourName"
                  placeholder="Who's accepting"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
              <div class="flex gap-2.5">
                <UButton
                  color="primary"
                  size="lg"
                  :loading="busy === 'accept'"
                  :disabled="!yourName.trim()"
                  @click="accept"
                >
                  Accept Proposal
                </UButton>
                <UButton
                  color="neutral"
                  variant="outline"
                  size="lg"
                  :disabled="busy !== null"
                  @click="declining = true"
                >
                  Decline
                </UButton>
              </div>
            </div>

            <div
              v-else
              class="mt-5 space-y-3"
            >
              <UFormField
                label="Anything we should know?"
                hint="Optional"
              >
                <UTextarea
                  v-model="declineReason"
                  :rows="2"
                  autoresize
                  placeholder="Budget, timing, went another way…"
                  class="w-full"
                />
              </UFormField>
              <div class="flex gap-2.5">
                <UButton
                  color="neutral"
                  size="lg"
                  :loading="busy === 'decline'"
                  @click="decline"
                >
                  Confirm Decline
                </UButton>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="lg"
                  @click="declining = false"
                >
                  Back
                </UButton>
              </div>
            </div>
          </div>

          <p class="mt-6 text-center text-[13px] text-muted">
            {{ proposal.agency.name }}<template v-if="proposal.agency.email">
              · <a
                :href="`mailto:${proposal.agency.email}`"
                class="underline underline-offset-2"
              >{{ proposal.agency.email }}</a>
            </template>
          </p>
        </template>
      </template>
    </div>
  </div>
</template>
