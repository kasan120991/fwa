<script setup lang="ts">
// Client detail › Profile — the full profile as a slide-over: contact, billing
// address, tags, portal status, and the private notes. The page owns the data
// and the notes save; this only renders and edits.
export interface ProfileClient {
  contact: string
  contactTitle: string
  email: string
  phone: string
  address: string[]
  since: string
  tags: { label: string, tone: 'primary' | 'neutral' | 'outline' }[]
}

defineProps<{
  open: boolean
  client: ProfileClient
  portal: { invited: boolean, email?: string, last_login_at?: string | null }
  notes: string
  editTo: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:notes': [value: string]
  'save-notes': []
  'invite': []
}>()

const tagVariant = { primary: 'soft', neutral: 'soft', outline: 'outline' } as const
const tagColor = { primary: 'primary', neutral: 'neutral', outline: 'neutral' } as const
</script>

<template>
  <USlideover
    :open="open"
    title="Profile"
    description="Contact, billing address, portal access, and private notes."
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <div class="flex flex-col">
        <!-- contact -->
        <div class="flex flex-col gap-3 pb-5">
          <div class="eyebrow">
            Primary Contact
          </div>
          <div class="flex items-center gap-3">
            <span class="inline-flex size-[38px] flex-none items-center justify-center rounded-btn bg-sand text-[13px] font-semibold text-highlighted">
              {{ client.contact.split(' ').map(w => w[0]).slice(0, 2).join('') }}
            </span>
            <div class="min-w-0">
              <div class="text-sm font-semibold text-highlighted">
                {{ client.contact }}
              </div>
              <div
                v-if="client.contactTitle"
                class="text-[13px] text-muted"
              >
                {{ client.contactTitle }}
              </div>
            </div>
          </div>
          <div class="flex flex-col gap-2.5">
            <a
              v-if="client.email"
              :href="`mailto:${client.email}`"
              class="flex items-center gap-2.5 text-[13.5px] text-default hover:text-primary"
            >
              <UIcon
                name="i-lucide-mail"
                class="size-[15px] flex-none text-muted"
              />{{ client.email }}
            </a>
            <a
              v-if="client.phone"
              :href="`tel:${phoneDigits(client.phone)}`"
              class="flex items-center gap-2.5 text-[13.5px] text-default hover:text-primary"
            >
              <UIcon
                name="i-lucide-phone"
                class="size-[15px] flex-none text-muted"
              />{{ formatPhone(client.phone) }}
            </a>
            <div
              v-if="portal.invited"
              class="flex items-center gap-2.5 text-[13.5px] text-muted"
            >
              <UIcon
                name="i-lucide-user-check"
                class="size-[15px] flex-none text-success"
              />Portal access · {{ portal.last_login_at ? 'active' : 'invited' }}
            </div>
            <button
              v-else
              type="button"
              class="flex items-center gap-2.5 text-[13.5px] font-semibold text-primary"
              @click="emit('invite')"
            >
              <UIcon
                name="i-lucide-user-plus"
                class="size-[15px] flex-none"
              />Invite to Portal
            </button>
          </div>
        </div>

        <!-- address -->
        <div class="flex flex-col gap-2.5 border-t border-default py-5">
          <div class="eyebrow">
            Billing Address
          </div>
          <div
            v-if="client.address.length"
            class="text-[13.5px] leading-relaxed text-default"
          >
            <div
              v-for="line in client.address"
              :key="line"
            >
              {{ line }}
            </div>
          </div>
          <div
            v-else
            class="text-[13.5px] text-muted"
          >
            No billing address on file.
          </div>
        </div>

        <!-- tags + since -->
        <div class="flex flex-col gap-3 border-t border-default py-5">
          <div class="eyebrow">
            Tags
          </div>
          <div
            v-if="client.tags.length"
            class="flex flex-wrap gap-2"
          >
            <UBadge
              v-for="t in client.tags"
              :key="t.label"
              :color="tagColor[t.tone]"
              :variant="tagVariant[t.tone]"
              size="sm"
            >
              {{ t.label }}
            </UBadge>
          </div>
          <div
            v-else
            class="text-[13.5px] text-muted"
          >
            No tags yet.
          </div>
          <div class="mt-1 flex items-center justify-between gap-3">
            <span class="text-[13px] text-muted">Client since</span>
            <span class="text-[13.5px] font-semibold text-highlighted tabular-nums">{{ client.since || '—' }}</span>
          </div>
        </div>

        <!-- notes -->
        <div class="flex flex-col gap-3 border-t border-default pt-5">
          <div class="flex items-center justify-between">
            <div class="eyebrow">
              Internal Notes
            </div>
            <span class="text-xs text-muted tabular-nums">{{ notes.length }} chars</span>
          </div>
          <UTextarea
            :model-value="notes"
            :rows="5"
            autoresize
            placeholder="Add a private note about this client…"
            class="w-full"
            @update:model-value="(v) => emit('update:notes', String(v ?? ''))"
            @blur="emit('save-notes')"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <UButton
        :to="editTo"
        icon="i-lucide-pencil"
        color="neutral"
        variant="outline"
      >
        Edit Client
      </UButton>
    </template>
  </USlideover>
</template>
