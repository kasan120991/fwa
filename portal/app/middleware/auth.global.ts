// Portal guard. Session lives in an httpOnly cookie on the API origin; SSR can't
// read it, so this runs client-side after auth.client.ts hydrates the user.
// Portal access requires a `client` login — admins are bounced to /login.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  const user = useAuthUser()
  const isPublic = to.path === '/login' || to.path === '/set-password'
  const isClient = user.value?.role === 'client'

  if (!isClient && !isPublic) return navigateTo('/login')
  if (isClient && to.path === '/login') return navigateTo('/')
})
