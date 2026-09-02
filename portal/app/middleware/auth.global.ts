// Portal guard. Session lives in an httpOnly cookie on the API origin; SSR can't
// read it, so this runs client-side after auth.client.ts hydrates the user.
// Portal access requires a `client` login — admins are bounced to /login.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  const user = useAuthUser()
  // /p/:token is the public proposal page — a prospect accepting or declining
  // has no account yet (the portal is invite-only), so it can't be behind auth.
  const isPublic = to.path === '/login' || to.path === '/set-password' || to.path.startsWith('/p/')
  const isClient = user.value?.role === 'client'

  if (!isClient && !isPublic) return navigateTo('/login')
  if (isClient && to.path === '/login') return navigateTo('/')
})
