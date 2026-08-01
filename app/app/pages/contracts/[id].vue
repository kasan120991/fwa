<script setup lang="ts">
// Contract viewer — the in-app home for a single contract. Shows the metadata,
// line items and status timeline, previews the PandaDoc document, and lets the
// owner countersign. Draft contracts can be sent to the client from here.
// Backed by /contracts/:id.
//
// The preview is a PDF (/contracts/:id/pdf), NOT a live PandaDoc session. The
// owner is a recipient on the document (for countersign), so opening a session
// registers a real recipient view and flips the document to `document.viewed` —
// which used to mark contracts "viewed" seconds after sending, before the client
// had opened anything. Sessions are minted only when Countersign is clicked.
definePageMeta({ title: 'Contract', breadcrumb: 'Sales' })

const route = useRoute()
const api = useApi()
const socket = useSocket()
const toast = useToast()

type CStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'voided'
interface LineItem { id: number, name_snapshot: string, description_snapshot: string | null, unit_price_snapshot: number, qty: number, line_total: number, billing_interval_snapshot: string }
interface Contract {
  id: number
  client_id: number
  project_id: number | null
  type: 'project' | 'care_plan'
  title: string
  status: CStatus
  currency: string
  total: number | null
  billing_interval: 'one_time' | 'monthly'
  start_date: string | null
  pandadoc_document_id: string | null
  pandadoc_status: string | null
  sent_at: string | null
  viewed_at: string | null
  signed_at: string | null
  declined_at: string | null
  created_at: string
  items: LineItem[]
}
interface DocState {
  ready: boolean
  reason?: 'no_document' | 'processing' | 'draft' | 'session_error' | 'pdf_error'
  status?: string
  message?: string
}
interface SessionResult extends DocState {
  embedUrl?: string
}

const STATUS_META: Record<CStatus, { label: string, status: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  draft: { label: 'Draft', status: 'neutral' },
  sent: { label: 'Sent', status: 'info' },
  viewed: { label: 'Viewed', status: 'info' },
  signed: { label: 'Signed', status: 'success' },
  declined: { label: 'Declined', status: 'error' },
  expired: { label: 'Expired', status: 'warning' },
  voided: { label: 'Voided', status: 'neutral' }
}

const contract = ref<Contract | null>(null)
const clientName = ref('')
const loading = ref(true)
const notFound = ref(false)

// `doc` drives the preview pane; `session` is only populated once the owner
// deliberately countersigns (which is allowed to register a view).
const doc = ref<DocState | null>(null)
const docLoading = ref(false)
const pdfUrl = ref<string | null>(null)
const session = ref<SessionResult | null>(null)
const sessionLoading = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | null = null

function revokePdf() {
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = null
  }
}

const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`)
const meta = computed(() => (contract.value ? STATUS_META[contract.value.status] : null))
// The document's page in the PandaDoc app (for previewing/editing a draft that
// can't be embedded yet). Requires a PandaDoc login — it's the owner's tool.
const pandadocUrl = computed(() => (contract.value?.pandadoc_document_id
  ? `https://app.pandadoc.com/a/#/documents/${contract.value.pandadoc_document_id}`
  : null))

const timeline = computed(() => {
  const c = contract.value
  if (!c) return []
  return [
    { label: 'Created', at: c.created_at },
    { label: 'Sent', at: c.sent_at },
    { label: 'Viewed', at: c.viewed_at },
    { label: 'Signed', at: c.signed_at },
    { label: 'Declined', at: c.declined_at }
  ].filter(s => s.at)
})

async function loadContract() {
  try {
    const { data } = await api<{ data: Contract }>(`/contracts/${route.params.id}`)
    contract.value = data
    if (data.client_id) loadClient(data.client_id)
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
}
async function loadClient(clientId: number) {
  try {
    const { data } = await api<{ data: { name: string | null, company: string | null } }>(`/clients/${clientId}`)
    clientName.value = data.company || data.name || ''
  } catch { /* header falls back to the title */ }
}

// Read-only preview. Registers nothing against any recipient — see the file header.
async function loadDocument() {
  if (docLoading.value) return
  docLoading.value = true
  try {
    const { data } = await api<{ data: DocState }>(`/contracts/${route.params.id}/document`)
    doc.value = data
    // The PandaDoc document is still being prepared — poll until it's ready.
    if (data.reason === 'processing') {
      pollTimer = setTimeout(loadDocument, 3000)
      return
    }
    if (!data.ready) return
    const blob = await api<Blob>(`/contracts/${route.params.id}/pdf`, { responseType: 'blob' })
    revokePdf()
    pdfUrl.value = URL.createObjectURL(blob)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    doc.value = { ready: false, reason: 'pdf_error', message: e?.data?.error?.message }
  } finally {
    docLoading.value = false
  }
}

// Countersign — mints a PandaDoc session and swaps the PDF for the live signing
// view. This DOES register the owner as having viewed; that's fine, it's a
// deliberate act, not a side effect of opening the page.
async function loadSession() {
  if (sessionLoading.value) return
  sessionLoading.value = true
  try {
    const { data } = await api<{ data: SessionResult }>(`/contracts/${route.params.id}/session`)
    if (data.ready) {
      session.value = data
    } else {
      // Most commonly the owner isn't a signer on this template.
      toast.add({
        title: 'Could not open the signing view',
        description: data.message || 'You may not be a signer on this document.',
        color: 'error'
      })
    }
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not open the signing view', description: e?.data?.error?.message || 'Try again.', color: 'error' })
  } finally {
    sessionLoading.value = false
  }
}

// The owner countersigns once the client has the document. Signed/voided/expired
// contracts are terminal — nothing left to sign.
const canCountersign = computed(() =>
  Boolean(doc.value?.ready && contract.value && ['sent', 'viewed'].includes(contract.value.status))
)

useHead({ title: () => `${contract.value?.title || 'Contract'} · Francis Web Agency` })

// ---- actions ----
const sending = ref(false)
async function sendToClient() {
  if (!contract.value || sending.value) return
  sending.value = true
  try {
    const { data } = await api<{ data: Contract }>(`/contracts/${contract.value.id}/send`, { method: 'POST' })
    contract.value = { ...contract.value, ...data }
    toast.add({ title: 'Contract sent', description: `${clientName.value || 'The client'} will get an email to review and sign.`, color: 'success' })
    // Refresh the preview only — opening a session here is what used to mark the
    // contract "viewed" seconds after it was sent.
    loadDocument()
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not send contract', description: e?.data?.error?.message || 'Try again.', color: 'error' })
  } finally {
    sending.value = false
  }
}

const voiding = ref(false)
async function voidContract() {
  if (!contract.value || voiding.value) return
  voiding.value = true
  try {
    const { data } = await api<{ data: Contract }>(`/contracts/${contract.value.id}/void`, { method: 'POST' })
    contract.value = { ...contract.value, ...data }
    toast.add({ title: 'Contract voided', color: 'success' })
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not void contract', description: e?.data?.error?.message || 'Try again.', color: 'error' })
  } finally {
    voiding.value = false
  }
}

const actionMenu = computed(() => {
  const c = contract.value
  if (!c) return []
  const items = []
  if (pandadocUrl.value) {
    items.push({ label: 'Open in PandaDoc', icon: 'i-lucide-external-link', to: pandadocUrl.value, target: '_blank' })
  }
  if (c.status !== 'signed' && c.status !== 'voided') {
    items.push({ label: 'Void Contract', icon: 'i-lucide-ban', color: 'error' as const, onSelect: voidContract })
  }
  return items.length ? [items] : []
})

function onContractChanged(payload: { id: number }) {
  if (contract.value && payload.id === contract.value.id) {
    loadContract()
    loadDocument()
  }
}

onMounted(async () => {
  await loadContract()
  if (!notFound.value) loadDocument()
  socket.on('contract:changed', onContractChanged)
})
onBeforeUnmount(() => {
  socket.off('contract:changed', onContractChanged)
  if (pollTimer) clearTimeout(pollTimer)
  revokePdf()
})
</script>

<template>
  <div class="w-full px-6 py-6">
    <div
      v-if="loading"
      class="flex items-center justify-center py-24 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin"
      />
    </div>

    <div
      v-else-if="notFound"
      class="flex flex-col items-center rounded-card bg-default px-6 py-20 text-center ring ring-default"
    >
      <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
        name="i-lucide-file-x"
        class="size-6"
      /></span>
      <h3 class="font-display text-lg font-semibold text-highlighted">
        Contract Not Found
      </h3>
      <UButton
        to="/agreements"
        variant="link"
        color="primary"
        class="mt-2"
      >
        Back to Agreements
      </UButton>
    </div>

    <template v-else-if="contract">
      <!-- header -->
      <div class="flex flex-col gap-4 border-b border-default pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            {{ contract.type === 'care_plan' ? 'Care Plan' : 'Project Contract' }}
          </div>
          <h1 class="mt-1 font-display text-[26px] font-semibold leading-tight tracking-tight text-highlighted">
            {{ contract.title }}
          </h1>
          <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span v-if="clientName">{{ clientName }}</span>
            <span
              v-if="clientName"
              class="text-muted/50"
            >·</span>
            <span class="font-semibold text-highlighted tabular-nums">{{ money(contract.total) }}</span>
            <span class="text-muted/50">·</span>
            <span>{{ contract.billing_interval === 'monthly' ? 'Monthly' : 'One-time' }}</span>
          </div>
        </div>
        <div class="flex flex-none items-center gap-2.5">
          <StatusChip
            v-if="meta"
            :status="meta.status"
          >
            {{ meta.label }}
          </StatusChip>
          <UButton
            v-if="contract.status === 'draft'"
            icon="i-lucide-send"
            color="primary"
            class="rounded-full"
            :loading="sending"
            @click="sendToClient"
          >
            Send to Client
          </UButton>
          <UDropdownMenu
            v-if="actionMenu.length"
            :items="actionMenu"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="outline"
              square
              class="rounded-full"
              aria-label="Contract actions"
            />
          </UDropdownMenu>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <!-- embedded document -->
        <div class="order-2 lg:order-1">
          <!-- live signing view — only after an explicit Countersign, since
               opening it registers the owner as having viewed the document. -->
          <div
            v-if="session?.ready && session.embedUrl"
            class="overflow-hidden rounded-card ring ring-default"
          >
            <iframe
              :src="session.embedUrl"
              class="h-[85vh] w-full border-0 bg-white"
              title="Contract document"
              allow="fullscreen"
            />
          </div>

          <!-- read-only preview (a PDF, so it registers no view) -->
          <div
            v-else-if="doc?.ready && pdfUrl"
            class="overflow-hidden rounded-card ring ring-default"
          >
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default bg-default px-4 py-2.5">
              <p class="text-xs text-muted">
                Read-only preview — opening this doesn't mark the contract viewed.
              </p>
              <UButton
                v-if="canCountersign"
                icon="i-lucide-file-signature"
                color="primary"
                size="xs"
                class="rounded-full"
                :loading="sessionLoading"
                @click="loadSession"
              >
                Sign Contract
              </UButton>
            </div>
            <iframe
              :src="pdfUrl"
              class="h-[85vh] w-full border-0 bg-white"
              title="Contract document"
            />
          </div>

          <!-- degraded / not-ready states -->
          <div
            v-else
            class="flex flex-col items-center rounded-card bg-default px-6 py-20 text-center ring ring-default"
          >
            <template v-if="!doc || docLoading || doc.reason === 'processing'">
              <UIcon
                name="i-lucide-loader-circle"
                class="mb-4 size-8 animate-spin text-primary"
              />
              <h3 class="font-display text-lg font-semibold text-highlighted">
                Preparing the document…
              </h3>
              <p class="mt-1.5 max-w-sm text-sm text-muted">
                PandaDoc is generating the contract from the project scope. This usually takes a few seconds.
              </p>
            </template>
            <template v-else-if="doc.reason === 'draft'">
              <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-primary/10 text-primary"><UIcon
                name="i-lucide-file-signature"
                class="size-6"
              /></span>
              <h3 class="font-display text-lg font-semibold text-highlighted">
                Draft ready to send
              </h3>
              <p class="mt-1.5 max-w-md text-sm text-muted">
                The document opens here once the contract is sent. Send it to the client, then countersign in‑app — or preview the filled draft in PandaDoc first.
              </p>
              <div class="mt-4 flex items-center gap-2.5">
                <UButton
                  icon="i-lucide-send"
                  color="primary"
                  size="sm"
                  class="rounded-full"
                  :loading="sending"
                  @click="sendToClient"
                >
                  Send to Client
                </UButton>
                <UButton
                  v-if="pandadocUrl"
                  icon="i-lucide-external-link"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="rounded-full"
                  :to="pandadocUrl"
                  target="_blank"
                >
                  Preview in PandaDoc
                </UButton>
              </div>
            </template>
            <template v-else-if="doc.reason === 'no_document'">
              <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
                name="i-lucide-file-text"
                class="size-6"
              /></span>
              <h3 class="font-display text-lg font-semibold text-highlighted">
                No PandaDoc document
              </h3>
              <p class="mt-1.5 max-w-sm text-sm text-muted">
                This contract was created locally. Connect PandaDoc to generate a signable document and embed it here.
              </p>
            </template>
            <template v-else>
              <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-warning/10 text-warning"><UIcon
                name="i-lucide-triangle-alert"
                class="size-6"
              /></span>
              <h3 class="font-display text-lg font-semibold text-highlighted">
                Can't load the document
              </h3>
              <p class="mt-1.5 max-w-md text-sm text-muted">
                {{ doc.message || 'The document preview could not be loaded from PandaDoc.' }}
              </p>
              <UButton
                icon="i-lucide-rotate-cw"
                color="neutral"
                variant="outline"
                size="sm"
                class="mt-4 rounded-full"
                @click="loadDocument"
              >
                Retry
              </UButton>
            </template>
          </div>
        </div>

        <!-- sidebar: line items + timeline -->
        <div class="order-1 flex flex-col gap-5 lg:order-2">
          <div class="rounded-card bg-default p-5 ring ring-default">
            <h2 class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Line Items
            </h2>
            <div class="mt-3 flex flex-col gap-2.5">
              <div
                v-for="li in contract.items"
                :key="li.id"
                class="flex items-start justify-between gap-3 text-[13.5px]"
              >
                <span class="min-w-0 text-default">{{ li.name_snapshot }}<span
                  v-if="li.qty > 1"
                  class="text-muted"
                > × {{ li.qty }}</span></span>
                <span class="flex-none font-medium text-highlighted tabular-nums">{{ money(li.line_total) }}</span>
              </div>
            </div>
            <div class="mt-3 flex items-center justify-between border-t border-default pt-3 text-sm">
              <span class="text-muted">Total</span>
              <span class="font-semibold text-highlighted tabular-nums">{{ money(contract.total) }}</span>
            </div>
          </div>

          <div
            v-if="timeline.length"
            class="rounded-card bg-default p-5 ring ring-default"
          >
            <h2 class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Timeline
            </h2>
            <div class="mt-3 flex flex-col gap-3">
              <div
                v-for="s in timeline"
                :key="s.label"
                class="flex items-center gap-3"
              >
                <span class="size-1.5 flex-none rounded-full bg-primary" />
                <span class="flex-1 text-[13.5px] text-default">{{ s.label }}</span>
                <span class="text-[12.5px] text-muted tabular-nums">{{ shortDateTime(s.at as string) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
