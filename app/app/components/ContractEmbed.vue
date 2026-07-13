<script setup lang="ts">
// Embeds a contract's PandaDoc document via a short-lived signing session
// (GET /contracts/:id/session). Reuses the same mechanism as the standalone
// contracts/[id] page; used to show a project's single contract inline in its
// Contracts tab. Drafts can't be embedded (PandaDoc), so we fall back to a
// prompt that links to the full contract page where it can be sent.
interface SessionResult {
  ready: boolean
  reason?: 'no_document' | 'processing' | 'draft' | 'session_error'
  embedUrl?: string
  status?: string
  message?: string
}

const props = defineProps<{ contractId: number }>()

const api = useApi()
const socket = useSocket()

const session = ref<SessionResult | null>(null)
const loading = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | undefined

async function loadSession() {
  if (loading.value) return
  loading.value = true
  try {
    const { data } = await api<{ data: SessionResult }>(`/contracts/${props.contractId}/session`)
    session.value = data
    // PandaDoc doc still being prepared — poll until embeddable.
    if (data.reason === 'processing') pollTimer = setTimeout(loadSession, 3000)
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    session.value = { ready: false, reason: 'session_error', message: e?.data?.error?.message }
  } finally {
    loading.value = false
  }
}

function onChanged() {
  loadSession()
}

onMounted(() => {
  loadSession()
  socket.on('contract:changed', onChanged)
})
onBeforeUnmount(() => {
  clearTimeout(pollTimer)
  socket.off('contract:changed', onChanged)
})
watch(() => props.contractId, () => loadSession())
</script>

<template>
  <div>
    <!-- embedded document -->
    <div
      v-if="session?.ready && session.embedUrl"
      class="overflow-hidden rounded-card ring ring-default"
    >
      <iframe
        :src="session.embedUrl"
        class="h-[70vh] min-h-[520px] w-full border-0 bg-white"
        title="Contract document"
        allow="fullscreen"
      />
    </div>

    <!-- degraded / not-ready states -->
    <div
      v-else
      class="flex flex-col items-center rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <template v-if="!session || loading || session.reason === 'processing'">
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
      <template v-else-if="session.reason === 'draft'">
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
      <template v-else-if="session.reason === 'no_document'">
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
          Can't embed the document
        </h3>
        <p class="mt-1.5 max-w-md text-sm text-muted">
          {{ session.message || 'The signing session could not be created.' }}
        </p>
        <UButton
          icon="i-lucide-rotate-cw"
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-4 rounded-full"
          @click="loadSession"
        >
          Retry
        </UButton>
      </template>
    </div>
  </div>
</template>
