// Hydrate the session on client startup so a refresh keeps you signed in.
// Runs (and awaits) before route middleware, so the auth guard sees the result.
export default defineNuxtPlugin(async () => {
  const { fetchMe, demoLogin } = useAuth()
  const user = await fetchMe()

  // Demo instance: nobody has credentials, so mint the demo session on arrival
  // and let the visitor land on the dashboard instead of a login wall. If it
  // fails we simply stay signed out — the login page offers the same door.
  if (!user && useRuntimeConfig().public.demoMode) {
    try {
      await demoLogin()
    } catch {
      // Demo account not provisioned yet (fresh stack, mid-reset) — fall
      // through to /login rather than blocking startup.
    }
  }
})
