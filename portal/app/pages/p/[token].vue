<script setup lang="ts">
// The public proposal page: what a prospect opens from the email to accept or
// decline. No login — the portal is invite-only and someone who hasn't bought
// anything yet has no account, so a capability link is the only thing that
// works for the case this whole flow exists to serve.
//
// The token is in the URL but is sent to the API as a HEADER. The server logs
// every request URL, so a token in the path would sit in the application log in
// plaintext and anyone with log access could accept any live proposal.
import type { View } from '~/components/PortalProposalView.vue'

definePageMeta({ layout: false })

const route = useRoute()
const config = useRuntimeConfig()
const token = String(route.params.token || '')

const base = String(config.public.apiBase || '').replace(/\/$/, '')
function call<T>(path: string, opts: Record<string, unknown> = {}) {
  return $fetch<T>(`${base}/public/proposals/self${path}`, {
    ...opts,
    headers: { 'X-Proposal-Token': token }
  })
}

const title = ref<string | null>(null)
useHead(() => ({ title: title.value ? `${title.value} · Proposal` : 'Proposal' }))

const fetchView = async () => {
  const { data } = await call<{ data: View }>('')
  title.value = data.title
  return data
}
const accept = async (name: string) => {
  await call('/accept', { method: 'POST', body: { name } })
  return undefined
}
const decline = (reason: string) => call('/decline', { method: 'POST', body: { reason } })
</script>

<template>
  <PortalProposalView
    variant="public"
    :fetch-view="fetchView"
    :on-accept="accept"
    :on-decline="decline"
  />
</template>
