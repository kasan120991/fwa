// Hydrate the session on client startup so a refresh keeps you signed in.
// Runs (and awaits) before route middleware, so the auth guard sees the result.
export default defineNuxtPlugin(async () => {
  await useAuth().fetchMe()
})
