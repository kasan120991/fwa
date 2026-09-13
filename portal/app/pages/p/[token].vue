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
  expires_at: string | null
  items: Item[]
  client: { name: string }
  // The decided payload is slimmer (no scope, no money) but still carries agency.
  agency?: { name: string, email: string | null, logo_url: string | null }
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
// Whole dollars for the headline figure; cents live in the line items.
const moneyRound = (n: number | null | undefined) =>
  n == null ? '—' : `$${Math.round(Number(n)).toLocaleString('en-US')}`
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
const CONTENT_BY: Record<string, string> = { client: 'Provided by you', developer: 'Written by us', mix: 'Shared' }

const agencyName = computed(() => proposal.value?.agency?.name || 'Francis Web Agency')
const agencyEmail = computed(() => proposal.value?.agency?.email || null)

/** The ink band's metadata strip: CODE · PREPARED FOR … · VALID UNTIL … */
const metaStrip = computed(() => {
  const p = proposal.value
  if (!p) return []
  return [
    p.code,
    p.client?.name ? `Prepared for ${p.client.name}` : null,
    p.expires_at ? `Valid until ${longDate(p.expires_at)}` : null
  ].filter(Boolean) as string[]
})

/** What accepting sets in motion — honest about the deposit rule. */
const nextSteps = computed(() => {
  const p = proposal.value
  const noDeposit = !p || p.deposit_pct === 0
  return [
    { title: 'Accept', body: 'Type your name below. Nothing is charged at this step.' },
    { title: 'Sign the agreement', body: 'It arrives by email within a few minutes for e-signature.' },
    noDeposit
      ? { title: 'We start', body: 'Work begins on signature. The full fee is invoiced at completion.' }
      : { title: 'Pay the deposit', body: `A ${p.deposit_pct}% deposit invoice follows the signature. Work starts when it's paid.` }
  ]
})

/** Multi-line SOW fields render as paragraphs, one per line. A paragraph that
 *  says "not in this SOW" is set as a muted aside so it can't be read as part
 *  of the deliverable. */
const paragraphs = (v: string | null | undefined) =>
  String(v ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    .map(text => ({ text, aside: /not in this sow/i.test(text) }))

/** The scope blocks, skipping any the proposal didn't fill in. */
const scope = computed(() => {
  const p = proposal.value
  if (!p) return []
  return [
    { label: 'Pages Included', paragraphs: paragraphs(p.pages_included) },
    { label: 'Key Features', paragraphs: paragraphs(p.key_features) },
    { label: 'Design Deliverables', paragraphs: paragraphs(p.design_deliverables) }
  ].filter(s => s.paragraphs.length)
})

/** The terms strip under the scope, skipping anything unset. */
const terms = computed(() => {
  const p = proposal.value
  if (!p) return []
  return [
    p.content_provided_by ? { label: 'Content', value: CONTENT_BY[p.content_provided_by] ?? p.content_provided_by } : null,
    { label: 'Revisions', value: `${p.revision_rounds} ${p.revision_rounds === 1 ? 'round' : 'rounds'}` },
    p.start_date ? { label: 'Start', value: longDate(p.start_date) } : null,
    p.target_launch_date ? { label: 'Target Launch', value: longDate(p.target_launch_date) } : null
  ].filter(Boolean) as { label: string, value: string | null }[]
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-default">
    <!-- ===== ink band: the one per page ===== -->
    <header class="bg-deep text-white">
      <div class="mx-auto w-full max-w-[880px] px-5 py-8 sm:px-8 sm:py-10">
        <div class="flex items-center justify-between gap-4">
          <a
            href="https://franciswebagency.com"
            class="inline-flex items-center gap-3"
          >
            <img
              src="/brand/fwa-mark-white.svg"
              alt=""
              class="block size-7"
            >
            <span class="text-[15px] font-semibold tracking-[-0.01em]">{{ agencyName }}</span>
          </a>
          <span class="eyebrow text-[#8C9096]">Proposal</span>
        </div>

        <div
          v-if="proposal && !outcome && !loadError"
          class="mt-12 sm:mt-16"
        >
          <div
            v-if="metaStrip.length"
            class="metastrip text-[#8C9096]"
          >
            {{ metaStrip.join(' · ') }}
          </div>
          <h1 class="mt-3 max-w-[16ch] font-display text-[34px] font-bold leading-[1.08] tracking-[-0.03em] text-white [text-wrap:balance] sm:text-[46px]">
            {{ proposal.title }}
          </h1>
          <div class="mt-6 h-0.5 w-10 bg-citrine" />
          <p
            v-if="proposal.goals"
            class="mt-6 max-w-[62ch] whitespace-pre-line text-[16px] leading-[1.6] text-[#B0B3B0] sm:text-[17px]"
          >
            {{ proposal.goals }}
          </p>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[880px] flex-1 px-5 py-10 sm:px-8 sm:py-14">
      <div
        v-if="pending"
        class="py-16 text-center text-sm text-muted"
      >
        Loading…
      </div>

      <!-- Dead, expired or already-used link. One message for all three, so it
           can't be used to probe which tokens are real. -->
      <div
        v-else-if="loadError && !proposal"
        class="mx-auto max-w-md py-10 text-center"
      >
        <span class="inline-flex size-12 items-center justify-center rounded-card bg-sand text-muted">
          <UIcon
            name="i-lucide-link-2-off"
            class="size-6"
          />
        </span>
        <h2 class="mt-5 font-display text-2xl font-bold tracking-[-0.028em] text-highlighted">
          This link is no longer valid
        </h2>
        <p class="mt-3 text-[15px] leading-relaxed text-muted">
          It may have expired, or the proposal has already been decided. Get in touch and we'll send a fresh one.
        </p>
      </div>

      <template v-else-if="proposal">
        <!-- Decided: either it already was, or we just decided it. -->
        <div
          v-if="outcome"
          class="mx-auto max-w-md py-10 text-center"
        >
          <span
            class="inline-flex size-12 items-center justify-center rounded-card"
            :class="outcome === 'accepted' ? 'bg-success/10 text-success' : 'bg-sand text-muted'"
          >
            <UIcon
              :name="outcome === 'accepted' ? 'i-lucide-check' : 'i-lucide-x'"
              class="size-6"
            />
          </span>
          <div class="metastrip mt-6">
            {{ [proposal.code, proposal.title].filter(Boolean).join(' · ') }}
          </div>
          <h2 class="mt-2 font-display text-[30px] font-bold leading-tight tracking-[-0.028em] text-highlighted [text-wrap:balance]">
            {{ outcome === 'accepted' ? 'Thank you — it’s accepted' : 'Proposal declined' }}
          </h2>
          <p class="mt-4 text-[15px] leading-relaxed text-muted">
            <template v-if="outcome === 'accepted'">
              We're preparing your agreement now. It'll arrive by email shortly for signature.
            </template>
            <template v-else>
              Thanks for letting us know. If anything changes, just reply to our email.
            </template>
          </p>
          <p
            v-if="agencyEmail"
            class="mt-8 text-[13.5px] text-muted"
          >
            Questions? <a
              :href="`mailto:${agencyEmail}`"
              class="font-semibold text-highlighted underline decoration-ink-300 decoration-1 underline-offset-4 hover:decoration-citrine hover:decoration-2"
            >{{ agencyEmail }}</a>
          </p>
        </div>

        <template v-else>
          <!-- ===== scope: stacked prose sections ===== -->
          <section v-if="scope.length">
            <h2 class="font-display text-[22px] font-bold tracking-[-0.028em] text-highlighted">
              What's included
            </h2>
            <div class="mt-5 border-t border-default">
              <div
                v-for="s in scope"
                :key="s.label"
                class="border-b border-default py-6"
              >
                <h3 class="eyebrow mb-3">
                  {{ s.label }}
                </h3>
                <div class="flex flex-col gap-3.5">
                  <p
                    v-for="(para, i) in s.paragraphs"
                    :key="i"
                    class="text-[15.5px] leading-[1.6]"
                    :class="para.aside ? 'border-l-2 border-ink-300 pl-3.5 text-muted' : 'text-default'"
                  >
                    {{ para.text }}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <!-- ===== terms strip ===== -->
          <section
            v-if="terms.length"
            class="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-card border-t-2 border-citrine bg-[var(--ui-border)] ring ring-default"
            :class="terms.length >= 4 ? 'sm:grid-cols-4' : terms.length === 3 ? 'sm:grid-cols-3' : ''"
          >
            <div
              v-for="t in terms"
              :key="t.label"
              class="bg-default px-5 py-4"
            >
              <div class="eyebrow">
                {{ t.label }}
              </div>
              <div class="mt-1.5 text-[15px] font-semibold tracking-[-0.01em] text-highlighted">
                {{ t.value }}
              </div>
            </div>
          </section>

          <!-- ===== investment: the linen register ===== -->
          <section class="mt-10 overflow-hidden rounded-band bg-sand">
            <div class="flex flex-col gap-6 px-6 pt-7 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:pt-8">
              <div>
                <div class="eyebrow">
                  Investment
                </div>
                <div class="mt-2 font-display text-[40px] font-bold leading-none tracking-[-0.03em] text-highlighted tabular-nums sm:text-[48px]">
                  {{ moneyRound(proposal.project_fee ?? proposal.total) }}
                </div>
                <div class="mt-2 text-[13px] text-muted">
                  {{ proposal.currency }} · fixed fee for the scope above
                </div>
              </div>
              <dl
                v-if="deposit != null"
                class="flex gap-8"
              >
                <template v-if="proposal.deposit_pct === 0">
                  <div>
                    <dt class="eyebrow">
                      Payment
                    </dt>
                    <dd class="mt-1.5 text-[15px] font-semibold text-highlighted">
                      No deposit
                    </dd>
                    <dd class="text-[12.5px] text-muted">
                      Full fee on completion
                    </dd>
                  </div>
                </template>
                <template v-else>
                  <div>
                    <dt class="eyebrow">
                      Deposit · {{ proposal.deposit_pct }}%
                    </dt>
                    <dd class="mt-1.5 text-[17px] font-bold text-highlighted tabular-nums">
                      {{ money(deposit) }}
                    </dd>
                    <dd class="text-[12.5px] text-muted">
                      To begin
                    </dd>
                  </div>
                  <div>
                    <dt class="eyebrow">
                      Balance
                    </dt>
                    <dd class="mt-1.5 text-[17px] font-bold text-highlighted tabular-nums">
                      {{ money(balance) }}
                    </dd>
                    <dd class="text-[12.5px] text-muted">
                      On completion
                    </dd>
                  </div>
                </template>
              </dl>
            </div>

            <table
              v-if="proposal.items.length"
              class="mt-7 w-full border-collapse"
            >
              <thead>
                <tr class="border-t border-b border-ink-300/60">
                  <th class="eyebrow px-6 py-2.5 text-left font-semibold sm:px-8">
                    Item
                  </th>
                  <th class="eyebrow px-6 py-2.5 text-right font-semibold sm:px-8">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(i, idx) in proposal.items"
                  :key="idx"
                  class="border-b border-ink-300/40 last:border-b-0"
                >
                  <td class="px-6 py-3 text-[14.5px] text-default sm:px-8">
                    {{ i.name }}<span
                      v-if="i.qty > 1"
                      class="text-muted"
                    > × {{ i.qty }}</span>
                    <div
                      v-if="i.description"
                      class="mt-0.5 text-[13px] text-muted"
                    >
                      {{ i.description }}
                    </div>
                  </td>
                  <td class="px-6 py-3 text-right text-[14.5px] font-semibold text-highlighted tabular-nums sm:px-8">
                    {{ money(i.line_total) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div
              v-else
              class="h-7"
            />
          </section>

          <!-- ===== notes ===== -->
          <section
            v-if="proposal.special_terms"
            class="mt-10"
          >
            <h2 class="eyebrow">
              Terms &amp; Notes
            </h2>
            <p class="mt-3 whitespace-pre-line text-[14.5px] leading-relaxed text-muted">
              {{ proposal.special_terms }}
            </p>
          </section>

          <!-- ===== what happens next ===== -->
          <section class="mt-12 border-t border-default pt-10">
            <h2 class="font-display text-[22px] font-bold tracking-[-0.028em] text-highlighted">
              What happens next
            </h2>
            <ol class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
              <li
                v-for="(step, i) in nextSteps"
                :key="step.title"
                class="flex gap-3"
              >
                <span class="mt-0.5 inline-flex size-6 flex-none items-center justify-center rounded-chip bg-inverted text-[12px] font-bold text-inverted tabular-nums">{{ i + 1 }}</span>
                <div>
                  <div class="text-[15px] font-semibold tracking-[-0.01em] text-highlighted">
                    {{ step.title }}
                  </div>
                  <p class="mt-1 text-[13.5px] leading-relaxed text-muted">
                    {{ step.body }}
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <!-- ===== decision ===== -->
          <section class="mt-10 rounded-card bg-default p-6 ring ring-default sm:p-8">
            <h2 class="font-display text-[22px] font-bold tracking-[-0.028em] text-highlighted">
              Ready to go ahead?
            </h2>
            <p class="mt-2 text-[15px] leading-relaxed text-muted">
              Accepting sends you the agreement to sign. <span class="hl font-semibold">Nothing is charged yet.</span>
            </p>

            <UAlert
              v-if="loadError"
              class="mt-5"
              icon="i-lucide-triangle-alert"
              color="error"
              variant="soft"
              :description="loadError"
            />

            <div
              v-if="!declining"
              class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end"
            >
              <UFormField
                label="Your Name"
                class="flex-1"
              >
                <UInput
                  v-model="yourName"
                  placeholder="Who's accepting on behalf of the company"
                  size="lg"
                  class="w-full"
                  @keyup.enter="yourName.trim() && accept()"
                />
              </UFormField>
              <div class="flex items-center gap-4">
                <UButton
                  color="primary"
                  size="lg"
                  :loading="busy === 'accept'"
                  :disabled="!yourName.trim()"
                  @click="accept"
                >
                  Accept Proposal
                </UButton>
                <button
                  type="button"
                  class="text-[14px] font-semibold text-highlighted underline decoration-citrine decoration-2 underline-offset-4 transition-colors hover:bg-citrine disabled:opacity-50"
                  :disabled="busy !== null"
                  @click="declining = true"
                >
                  Decline
                </button>
              </div>
            </div>

            <div
              v-else
              class="mt-6 space-y-4"
            >
              <UFormField
                label="Anything We Should Know?"
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
              <div class="flex items-center gap-4">
                <UButton
                  color="neutral"
                  variant="outline"
                  size="lg"
                  :loading="busy === 'decline'"
                  @click="decline"
                >
                  Confirm Decline
                </UButton>
                <button
                  type="button"
                  class="text-[14px] font-semibold text-muted hover:text-highlighted"
                  @click="declining = false"
                >
                  Back
                </button>
              </div>
            </div>
          </section>

          <p class="mt-10 text-center text-[13px] text-muted">
            Questions about this proposal?
            <template v-if="agencyEmail">
              Email <a
                :href="`mailto:${agencyEmail}`"
                class="font-semibold text-highlighted underline decoration-ink-300 decoration-1 underline-offset-4 hover:decoration-citrine hover:decoration-2"
              >{{ agencyEmail }}</a> or just reply to the email this came in.
            </template>
            <template v-else>
              Just reply to the email this came in.
            </template>
          </p>
        </template>
      </template>
    </main>

    <footer class="border-t border-default">
      <div class="mx-auto flex w-full max-w-[880px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-[12.5px] text-muted sm:px-8">
        <span>{{ agencyName }}</span>
        <span class="metastrip">{{ proposal?.code ? `Proposal · ${proposal.code}` : 'Proposal' }}</span>
      </div>
    </footer>
  </div>
</template>
