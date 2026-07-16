<script setup lang="ts">
// Previews a contract's PandaDoc document inline in a project's Contracts tab.
// Drafts can't be previewed, so we fall back to a prompt that links to the full
// contract page where it can be sent.
//
// This shows a PDF (GET /contracts/:id/pdf), NOT a live PandaDoc session. The
// owner is a recipient on the document (for countersign), so a session would
// register a real recipient view and flip the doc to `document.viewed` — which
// used to mark contracts "viewed" the moment this tab was opened, before the
// client had seen anything. Countersigning lives on the full contract page.
interface DocState {
  ready: boolean
  reason?: 'no_document' | 'processing' | 'draft' | 'pdf_error'
  status?: string
  message?: string
}

const props = defineProps<{ contractId: number }>()

const api = useApi()
const socket = useSocket()

const doc = ref<DocState | null>(null)
const loading = ref(false)
const pdfUrl = ref<string | null>(null)
let pollTimer: ReturnType<typeof setTimeout> | undefined

function revokePdf() {
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = null
  }
}

async function loadDocument() {
  if (loading.value) return
  loading.value = true
  try {
    const { data } = await api<{ data: DocState }>(`/contracts/${props.contractId}/document`)
    doc.value = data
    // PandaDoc doc still being prepared — poll until ready.
    if (data.reason === 'processing') {
      pollTimer = setTimeout(loadDocument, 3000)
      return
    }
    if (!data.ready) return
    const blob = await api<Blob>(`/contracts/${props.contractId}/pdf`, { responseType: 'blob' })
    revokePdf()
    pdfUrl.value = URL.createObjectURL(blob)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    doc.value = { ready: false, reason: 'pdf_error', message: e?.data?.error?.message }
  } finally {
    loading.value = false
  }
}

function onChanged() {
  loadDocument()
}

onMounted(() => {
  loadDocument()
  socket.on('contract:changed', onChanged)
})
onBeforeUnmount(() => {
  clearTimeout(pollTimer)
  socket.off('contract:changed', onChanged)
  revokePdf()
})
watch(() => props.contractId, () => loadDocument())
</script>

<template>
  <div>
    <!-- read-only preview (a PDF, so it registers no view) -->
    <div
      v-if="doc?.ready && pdfUrl"
      class="overflow-hidden rounded-card ring ring-default"
    >
      <iframe
        :src="pdfUrl"
        class="h-[70vh] min-h-[520px] w-full border-0 bg-white"
        title="Contract document"
      />
    </div>

    <!-- degraded / not-ready states -->
    <div
      v-else
      class="flex flex-col items-center rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <template v-if="!doc || loading || doc.reason === 'processing'">
        <UIcon
          name="i-lucide-loader-circle"
          class="mb-4 size-8 animate-spin text-primary"
        />
        <h3 class="font-display text-lg font-medium text-highlighted">
          Preparing the document…
        </h3>
        <p class="mt-1.5 max-w-sm text-sm text-muted">
          PandaDoc is generating the contract. This usually takes a few seconds.
        </p>
      </template>
      <template v-else-if="doc.reason === 'draft'">
        <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-primary/10 text-primary"><UIcon
          name="i-lucide-file-signature"
          class="size-6"
        /></span>
        <h3 class="font-display text-lg font-medium text-highlighted">
          Not Sent Yet
        </h3>
        <p class="mt-1.5 max-w-md text-sm text-muted">
          The signed document appears here once the contract is sent to the client.
        </p>
        <UButton
          :to="`/contracts/${contractId}`"
          icon="i-lucide-send"
          color="primary"
          size="sm"
          class="mt-4 rounded-full"
        >
          Open full contract to send
        </UButton>
      </template>
      <template v-else-if="doc.reason === 'no_document'">
        <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-muted text-muted"><UIcon
          name="i-lucide-file-text"
          class="size-6"
        /></span>
        <h3 class="font-display text-lg font-medium text-highlighted">
          No PandaDoc Document
        </h3>
        <p class="mt-1.5 max-w-sm text-sm text-muted">
          This contract has no signable document to embed yet.
        </p>
      </template>
      <template v-else>
        <span class="mb-4 inline-flex size-12 items-center justify-center rounded-[12px] bg-warning/10 text-warning"><UIcon
          name="i-lucide-triangle-alert"
          class="size-6"
        /></span>
        <h3 class="font-display text-lg font-medium text-highlighted">
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
</template>
