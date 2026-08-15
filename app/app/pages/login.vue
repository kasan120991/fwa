<script setup lang="ts">
definePageMeta({
  // Bare page — no app shell chrome around the login screen.
  layout: false
})

useHead({ title: 'Sign in · Francis Web Agency' })

const { login, demoLogin } = useAuth()

// On the demo instance there are no credentials to type — the startup plugin
// signs everyone in automatically, so this page is only reached after an
// explicit sign-out. Offer the same door as a button rather than a dead form.
const demoMode = useRuntimeConfig().public.demoMode

const email = ref('')
const password = ref('')
const remember = ref(true)
const showPass = ref(false)
const loading = ref(false)
const errorMessage = ref('')

const year = new Date().getFullYear()

async function onSubmit() {
  if (loading.value) return
  errorMessage.value = ''
  loading.value = true
  try {
    await login(email.value.trim(), password.value)
    await navigateTo('/')
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    errorMessage.value = e?.data?.error?.message || 'Couldn\'t sign in. Check your connection and try again.'
  } finally {
    loading.value = false
  }
}

async function onEnterDemo() {
  if (loading.value) return
  errorMessage.value = ''
  loading.value = true
  try {
    await demoLogin()
    await navigateTo('/')
  } catch (err: unknown) {
    const e = err as { data?: { error?: { message?: string } } }
    errorMessage.value = e?.data?.error?.message || 'The demo isn\'t available right now. Try again in a moment.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen w-full">
    <!-- LEFT — brand panel -->
    <div class="relative hidden basis-[56%] overflow-hidden bg-deep lg:flex lg:flex-col lg:items-center lg:justify-center p-16">
      <!-- concentric hairline accents (flat system — no gradients) -->
      <div class="pointer-events-none absolute -bottom-[260px] -right-[200px] h-[640px] w-[640px] rounded-full border border-white/[0.06]" />
      <div class="pointer-events-none absolute -bottom-[180px] -right-[120px] h-[480px] w-[480px] rounded-full border border-white/[0.04]" />

      <div class="relative flex flex-col items-center text-center">
        <img
          src="/brand/fwa-logo-stacked-white.svg"
          alt="Francis Web Agency"
          class="block h-auto w-[300px] max-w-[60%]"
        >
        <div class="my-[22px] mt-[34px] h-0.5 w-10 bg-citrine" />
        <p class="m-0 max-w-[340px] text-base leading-relaxed text-[#B0B3B0]">
          Agency Management Platform — everything your agency needs, in one place.
        </p>
      </div>

      <div class="eyebrow absolute bottom-10 left-12 text-[#8C9096]">
        Francis Web Agency · Internal
      </div>
    </div>

    <!-- RIGHT — form pane -->
    <div class="flex flex-1 items-center justify-center bg-default px-10 py-12">
      <div class="w-full max-w-[420px]">
        <!-- mobile mini-brand -->
        <div class="mb-9 flex items-center justify-center gap-2.5 lg:hidden">
          <span class="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-deep">
            <img src="/brand/fwa-mark-white.svg" alt="" class="block h-[18px] w-[18px]">
          </span>
        </div>

        <div>
          <h1 class="text-[2.125rem] leading-[1.1] tracking-tight text-highlighted">
            {{ demoMode ? 'Take a Look Around' : 'Welcome Back' }}
          </h1>
          <p class="mt-2 mb-[30px] text-[0.9375rem] leading-relaxed text-muted">
            {{ demoMode
              ? 'This is a live demo of the Francis Web Agency platform, loaded with sample data. No sign-up, nothing to fill in.'
              : 'Sign in to your Francis Web Agency workspace.' }}
          </p>
        </div>

        <!-- DEMO — one button in, no credentials -->
        <div v-if="demoMode" class="flex flex-col gap-[18px]">
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :title="errorMessage"
            :ui="{ root: 'items-center' }"
          />

          <UButton
            block
            size="lg"
            :loading="loading"
            trailing-icon="i-lucide-arrow-right"
            @click="onEnterDemo"
          >
            Enter the Demo
          </UButton>

          <p class="m-0 text-center text-sm text-muted">
            Everything here is sample data, and it resets every night — click around freely.
          </p>
        </div>

        <form v-else class="flex flex-col gap-[18px]" @submit.prevent="onSubmit">
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :title="errorMessage"
            :ui="{ root: 'items-center' }"
          />

          <!-- Email -->
          <UFormField label="Email" name="email">
            <UInput
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="you@agency.com"
              icon="i-lucide-mail"
              size="lg"
              class="w-full"
            />
          </UFormField>

          <!-- Password -->
          <UFormField name="password">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-sm font-medium text-highlighted">Password</span>
              <ULink to="#" class="text-[13px] font-medium text-primary">Forgot Password?</ULink>
            </div>
            <UInput
              v-model="password"
              :type="showPass ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="••••••••"
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
                  @click="showPass = !showPass"
                />
              </template>
            </UInput>
          </UFormField>

          <!-- Remember me -->
          <UCheckbox v-model="remember" label="Keep Me Signed In" class="mt-0.5" />

          <!-- Submit -->
          <UButton
            type="submit"
            block
            size="lg"
            :loading="loading"
            class="mt-1.5"
          >
            Sign In
          </UButton>
        </form>

        <!-- divider + help -->
        <template v-if="!demoMode">
          <div class="my-[26px] mb-[18px] flex items-center gap-3.5">
            <div class="h-px flex-1 bg-default" />
            <span class="eyebrow text-muted">Trouble signing in</span>
            <div class="h-px flex-1 bg-default" />
          </div>
          <p class="m-0 text-center text-sm text-muted">
            Contact your workspace admin or
            <ULink to="#" class="font-medium text-primary">get support</ULink>.
          </p>
        </template>

        <!-- demo: point a convinced visitor at the real thing -->
        <template v-else>
          <div class="my-[26px] mb-[18px] flex items-center gap-3.5">
            <div class="h-px flex-1 bg-default" />
            <span class="eyebrow text-muted">Want this for your agency</span>
            <div class="h-px flex-1 bg-default" />
          </div>
          <p class="m-0 text-center text-sm text-muted">
            Talk to us at
            <ULink to="https://franciswebagency.com/contact" class="font-medium text-primary">franciswebagency.com</ULink>.
          </p>
        </template>

        <p class="mt-10 text-center text-xs text-muted/70">
          © {{ year }} Francis Web Agency. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</template>
