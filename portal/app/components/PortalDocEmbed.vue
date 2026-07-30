<script setup lang="ts">
// Embedded PandaDoc signing for a client's proposal/contract. Fetches a
// short-lived session from the portal API and renders the iframe; polls while
// the doc is still being prepared and live-refreshes when its status changes.
const props = defineProps<{ kind: 'proposal' | 'contract', id: number }>()

const api = useApi()
const socket = useSocket()

interface SessionResult {
  ready: boolean
  embedUrl?: string
  expiresAt?: string
  status?: string
  reason?: string
  message?: string
}

const session = ref<SessionResult | null>(null)
const loading = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | undefined

async function loadSession() {
  if (loading.value) return
  loading.value = true
  try {
    const { data } = await api<{ data: SessionResult }>(`/portal/agreements/${props.kind}/${props.id}/session`)
    session.value = data
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
  socket.on('agreement:changed', onChanged)
})
onBeforeUnmount(() => {
  clearTimeout(pollTimer)
  socket.off('agreement:changed', onChanged)
})
</script>

<template>
  <div>
    <div
      v-if="loading && !session"
      class="rounded-card bg-default px-6 py-16 text-center text-sm text-muted ring ring-default"
    >
      Preparing your document…
    </div>

    <div
      v-else-if="session?.ready && session.embedUrl"
      class="overflow-hidden rounded-card ring ring-default"
    >
      <iframe
        :src="session.embedUrl"
        class="h-[74vh] min-h-[560px] w-full border-0 bg-white"
        title="Sign document"
        allow="fullscreen"
      />
    </div>

    <!-- degraded states -->
    <div
      v-else-if="session?.reason === 'processing'"
      class="flex flex-col items-center rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="mb-3 size-6 animate-spin text-primary"
      />
      <p class="text-sm text-muted">
        Getting your document ready — this only takes a moment.
      </p>
    </div>

    <div
      v-else-if="session?.reason === 'draft' || session?.reason === 'no_document'"
      class="rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-semibold text-highlighted">
        Not ready to sign yet
      </h3>
      <p class="mt-1.5 text-sm text-muted">
        We'll email you the moment this document is ready for your signature.
      </p>
    </div>

    <div
      v-else
      class="flex flex-col items-center rounded-card bg-default px-6 py-16 text-center ring ring-default"
    >
      <h3 class="font-display text-lg font-semibold text-highlighted">
        Couldn't open the document
      </h3>
      <p class="mt-1.5 max-w-sm text-sm text-muted">
        {{ session?.message || 'Please try again, or contact us if it keeps happening.' }}
      </p>
      <UButton
        class="mt-4"
        color="neutral"
        variant="outline"
        icon="i-lucide-refresh-cw"
        @click="loadSession"
      >
        Try again
      </UButton>
    </div>
  </div>
</template>
