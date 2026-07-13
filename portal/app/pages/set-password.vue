<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Set your password · Francis Web Agency' })

const route = useRoute()
const api = useApi()
const { fetchMe } = useAuth()

const token = computed(() => String(route.query.token || ''))
const password = ref('')
const confirm = ref('')
const showPass = ref(false)
const loading = ref(false)
const errorMessage = ref('')

async function onSubmit() {
  if (loading.value) return
  errorMessage.value = ''
  if (password.value.length < 8) {
    errorMessage.value = 'Use at least 8 characters.'
    return
  }
  if (password.value !== confirm.value) {
    errorMessage.value = 'Those passwords don\'t match.'
    return
  }
  if (!token.value) {
    errorMessage.value = 'This link is missing its token — check the email link.'
    return
  }
  loading.value = true
  try {
    await api('/auth/set-password', { method: 'POST', body: { token: token.value, password: password.value } })
    await fetchMe() // the server auto-logs-in (sets the session cookie)
    await navigateTo('/')
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    errorMessage.value = e?.data?.error?.message || 'Could not set your password. The link may have expired.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen w-full items-center justify-center bg-muted px-6 py-12">
    <div class="w-full max-w-[420px]">
      <div class="mb-8 flex items-center justify-center gap-2.5">
        <span class="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-deep">
          <img
            src="/brand/fwa-mark-white.svg"
            alt=""
            class="block h-[18px] w-[18px]"
          >
        </span>
      </div>

      <div class="rounded-card bg-default p-8 ring ring-default">
        <h1 class="font-display text-[1.75rem] font-medium leading-tight tracking-tight text-highlighted">
          Set your password
        </h1>
        <p class="mt-2 mb-6 text-[0.9375rem] leading-relaxed text-muted">
          Choose a password to activate your Francis Web Agency client portal.
        </p>

        <form
          class="flex flex-col gap-[18px]"
          @submit.prevent="onSubmit"
        >
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :title="errorMessage"
            :ui="{ root: 'items-center' }"
          />

          <UFormField
            label="New password"
            name="password"
          >
            <UInput
              v-model="password"
              :type="showPass ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="At least 8 characters"
              icon="i-lucide-lock"
              size="lg"
              class="w-full"
              :ui="{ trailing: 'pe-1' }"
            >
              <template #trailing>
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  :icon="showPass ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="showPass ? 'Hide password' : 'Show password'"
                  @click="() => { showPass = !showPass }"
                />
              </template>
            </UInput>
          </UFormField>

          <UFormField
            label="Confirm password"
            name="confirm"
          >
            <UInput
              v-model="confirm"
              :type="showPass ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="Re-enter your password"
              icon="i-lucide-lock"
              size="lg"
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            block
            size="lg"
            :loading="loading"
            class="mt-1.5"
          >
            Set password &amp; sign in
          </UButton>
        </form>
      </div>

      <p class="mt-6 text-center text-xs text-muted/70">
        © {{ new Date().getFullYear() }} Francis Web Agency. All rights reserved.
      </p>
    </div>
  </div>
</template>
