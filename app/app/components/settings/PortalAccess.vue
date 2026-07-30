<script setup lang="ts">
// Settings → Client Portal Access: every client with its portal-login status,
// centralizing invite / resend / revoke. Reuses POST /clients/:id/invite and the
// new revoke/restore endpoints.
const api = useApi()
const toast = useToast()

interface Row {
  id: number
  name: string
  email: string | null
  portal_email: string | null
  status: 'active' | 'invited' | 'revoked' | 'none'
  last_login_at: string | null
}
const rows = ref<Row[]>([])
const pending = ref(true)
const busy = ref<number | null>(null)

async function load() {
  const { data } = await api<{ data: Row[] }>('/settings/portal-access')
  rows.value = data
  pending.value = false
}
onMounted(load)

const STATUS: Record<Row['status'], { label: string, class: string }> = {
  active: { label: 'Active', class: 'bg-success/10 text-success' },
  invited: { label: 'Invited', class: 'bg-warning/10 text-warning' },
  revoked: { label: 'Revoked', class: 'bg-error/10 text-error' },
  none: { label: 'No Access', class: 'bg-elevated text-muted' }
}

function initials(name: string) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}
function lastActive(r: Row) {
  if (r.status === 'active' && r.last_login_at) return `Active ${timeAgo(r.last_login_at)}`
  if (r.status === 'invited') return 'Awaiting sign-in'
  return '—'
}

async function invite(r: Row) {
  busy.value = r.id
  try {
    const { data } = await api<{ data: { setPasswordUrl: string, email: string } }>(`/clients/${r.id}/invite`, { method: 'POST' })
    try { await navigator.clipboard?.writeText(data.setPasswordUrl) } catch { /* clipboard optional */ }
    toast.add({ title: 'Invite sent', description: `Set-password link copied — emailed to ${data.email}.`, color: 'success' })
    await load()
  } catch (e: unknown) {
    const err = e as { data?: { error?: { message?: string } } }
    toast.add({ title: 'Could not send invite', description: err?.data?.error?.message || 'Try again.', color: 'error' })
  } finally {
    busy.value = null
  }
}
async function revoke(r: Row) {
  busy.value = r.id
  try {
    await api(`/clients/${r.id}/portal/revoke`, { method: 'POST' })
    toast.add({ title: 'Portal access revoked', description: `${r.name} was signed out.`, color: 'success' })
    await load()
  } catch {
    toast.add({ title: 'Could not revoke access', color: 'error' })
  } finally {
    busy.value = null
  }
}
async function restore(r: Row) {
  busy.value = r.id
  try {
    await api(`/clients/${r.id}/portal/restore`, { method: 'POST' })
    toast.add({ title: 'Portal access restored', color: 'success' })
    await load()
  } catch {
    toast.add({ title: 'Could not restore access', color: 'error' })
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section class="overflow-hidden rounded-card bg-default ring ring-default">
    <div class="flex items-start justify-between gap-4 p-6 pb-4">
      <div>
        <h2 class="text-base font-semibold text-highlighted">
          Client Portal Access
        </h2>
        <p class="mt-1 text-[13.5px] text-muted">
          Clients you invite get a login to view their projects, invoices, agreements, and files.
        </p>
      </div>
    </div>

    <div
      v-if="pending"
      class="px-6 py-12 text-center text-sm text-muted"
    >
      Loading…
    </div>

    <div
      v-else
      class="overflow-x-auto"
    >
      <table class="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr class="border-y border-default text-left">
            <th class="px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Client</th>
            <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Portal Email</th>
            <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Status</th>
            <th class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Last Active</th>
            <th class="px-6 py-2.5" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.id"
            class="border-b border-default last:border-0"
          >
            <td class="px-6 py-3.5">
              <div class="flex items-center gap-3">
                <span class="flex size-8 flex-none items-center justify-center rounded-[9px] bg-elevated text-[12px] font-semibold text-toned">{{ initials(r.name) }}</span>
                <span class="font-semibold text-highlighted">{{ r.name }}</span>
              </div>
            </td>
            <td class="px-4 py-3.5 text-muted">
              {{ r.portal_email || '—' }}
            </td>
            <td class="px-4 py-3.5">
              <span class="inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-[11px] font-semibold" :class="STATUS[r.status].class">
                <span class="size-1.5 rounded-full bg-current" />{{ STATUS[r.status].label }}
              </span>
            </td>
            <td class="px-4 py-3.5 text-muted tabular-nums">
              {{ lastActive(r) }}
            </td>
            <td class="px-6 py-3.5">
              <div class="flex items-center justify-end gap-3">
                <template v-if="busy === r.id">
                  <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" />
                </template>
                <template v-else-if="r.status === 'none'">
                  <button class="text-[13px] font-semibold text-primary disabled:opacity-50" :disabled="!r.email" :title="r.email ? '' : 'Client has no email'" @click="invite(r)">Invite</button>
                </template>
                <template v-else-if="r.status === 'invited'">
                  <button class="text-[13px] font-semibold text-primary" @click="invite(r)">Resend</button>
                  <button class="text-[13px] font-semibold text-error" @click="revoke(r)">Revoke</button>
                </template>
                <template v-else-if="r.status === 'active'">
                  <button class="text-[13px] font-semibold text-error" @click="revoke(r)">Revoke</button>
                </template>
                <template v-else-if="r.status === 'revoked'">
                  <button class="text-[13px] font-semibold text-primary" @click="restore(r)">Restore</button>
                  <button class="text-[13px] font-semibold text-primary" @click="invite(r)">Re-invite</button>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="!rows.length"
        class="px-6 py-12 text-center text-sm text-muted"
      >
        No clients yet.
      </div>
    </div>
  </section>
</template>
