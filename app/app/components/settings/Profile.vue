<script setup lang="ts">
// Settings → Profile: the signed-in admin's own account (name, email, avatar) +
// change password. Backs onto PATCH /auth/me and POST /auth/change-password.
const api = useApi()
const toast = useToast()
const { user, fetchMe } = useAuth()
const { upload, resolveUrl } = useUploads()

const form = reactive({ name: '', email: '', avatar_url: '' as string | null })
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const original = ref('')

function snapshot() { return JSON.stringify(form) }
function seed() {
  form.name = user.value?.name ?? ''
  form.email = user.value?.email ?? ''
  form.avatar_url = user.value?.avatar_url ?? ''
  original.value = snapshot()
}
onMounted(async () => { await fetchMe(); seed() })

const dirty = computed(() => snapshot() !== original.value)
const initials = computed(() => (form.name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join(''))

// --- avatar upload ---
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
function pickPhoto() { fileInput.value?.click() }
async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const res = await upload(file)
    form.avatar_url = res.path
  } catch {
    toast.add({ title: "Couldn't upload photo", description: 'Please try a different image.', color: 'error' })
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function save() {
  if (saving.value || !dirty.value) return
  errors.value = {}
  saving.value = true
  try {
    const { user: u } = await api<{ user: typeof user.value }>('/auth/me', {
      method: 'PATCH',
      body: { name: form.name.trim(), email: form.email.trim(), avatar_url: form.avatar_url || null }
    })
    user.value = u
    seed()
    toast.add({ title: 'Profile saved', color: 'success' })
  } catch (e: unknown) {
    const err = e as { data?: { error?: { message?: string, fields?: Record<string, string> } } }
    errors.value = err?.data?.error?.fields ?? {}
    toast.add({ title: "Couldn't save profile", description: err?.data?.error?.message || 'Check the form and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}

// --- change password ---
const pw = reactive({ current: '', next: '', confirm: '' })
const pwError = ref('')
const changingPw = ref(false)
async function changePassword() {
  pwError.value = ''
  if (pw.next.length < 8) { pwError.value = 'New password must be at least 8 characters.'; return }
  if (pw.next !== pw.confirm) { pwError.value = 'New passwords do not match.'; return }
  changingPw.value = true
  try {
    await api('/auth/change-password', { method: 'POST', body: { current_password: pw.current, new_password: pw.next } })
    pw.current = pw.next = pw.confirm = ''
    toast.add({ title: 'Password updated', color: 'success' })
  } catch (e: unknown) {
    const err = e as { data?: { error?: { message?: string } } }
    pwError.value = err?.data?.error?.message || 'Could not update your password.'
  } finally {
    changingPw.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Your Profile -->
    <section class="rounded-card bg-default p-6 ring ring-default">
      <div class="mb-5">
        <h2 class="text-base font-semibold text-highlighted">
          Your Profile
        </h2>
        <p class="mt-1 text-[13.5px] text-muted">
          How you appear inside FWA Ops. Only you can see this.
        </p>
      </div>

      <div class="mb-5 flex items-center gap-4">
        <span
          v-if="uploading"
          class="flex size-[60px] flex-none items-center justify-center rounded-[14px] bg-muted text-muted ring ring-default"
        >
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        </span>
        <img
          v-else-if="form.avatar_url"
          :src="resolveUrl(form.avatar_url)"
          alt="Your photo"
          class="size-[60px] flex-none rounded-[14px] object-cover ring ring-default"
        >
        <span
          v-else
          class="flex size-[60px] flex-none items-center justify-center rounded-[14px] bg-primary text-lg font-semibold text-inverted"
        >{{ initials }}</span>
        <div class="flex flex-col gap-1">
          <button type="button" class="text-left text-[13.5px] font-semibold text-primary" @click="pickPhoto">
            Change Photo
          </button>
          <button
            v-if="form.avatar_url"
            type="button"
            class="text-left text-[12.5px] text-muted hover:text-error"
            @click="form.avatar_url = ''"
          >
            Remove
          </button>
          <span v-else class="text-[12.5px] text-muted">JPG or PNG, up to 10 MB.</span>
        </div>
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFile">
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField label="Full Name" :error="errors.name">
          <UInput v-model="form.name" size="lg" class="w-full" />
        </UFormField>
        <UFormField label="Email" :error="errors.email">
          <UInput v-model="form.email" type="email" size="lg" class="w-full" />
        </UFormField>
      </div>
      <div class="mt-4">
        <label class="mb-1.5 block text-sm font-medium text-toned">Role</label>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1 text-xs font-semibold text-primary">
          <span class="size-1.5 rounded-full bg-current" />{{ user?.role === 'admin' ? 'Admin' : 'Client' }}
        </span>
        <p class="mt-1.5 text-xs text-muted">Contact support to change your role.</p>
      </div>

      <div class="mt-6 flex justify-end border-t border-default pt-4">
        <UButton :loading="saving" :disabled="!dirty" color="primary" size="lg" @click="save">
          Save Changes
        </UButton>
      </div>
    </section>

    <!-- Password -->
    <section class="rounded-card bg-default p-6 ring ring-default">
      <div class="mb-5">
        <h2 class="text-base font-semibold text-highlighted">
          Password
        </h2>
        <p class="mt-1 text-[13.5px] text-muted">
          Use at least 8 characters.
        </p>
      </div>
      <div class="flex flex-col gap-4">
        <UFormField label="Current Password" class="sm:max-w-sm">
          <UInput v-model="pw.current" type="password" size="lg" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UFormField label="New Password">
            <UInput v-model="pw.next" type="password" size="lg" class="w-full" />
          </UFormField>
          <UFormField label="Confirm New Password">
            <UInput v-model="pw.confirm" type="password" size="lg" class="w-full" />
          </UFormField>
        </div>
        <p v-if="pwError" class="text-[13px] text-error">
          {{ pwError }}
        </p>
      </div>
      <div class="mt-6 flex justify-end border-t border-default pt-4">
        <UButton
          :loading="changingPw"
          :disabled="!pw.current || !pw.next || !pw.confirm"
          color="neutral"
          variant="outline"
          size="lg"
          @click="changePassword"
        >
          Update Password
        </UButton>
      </div>
    </section>
  </div>
</template>
