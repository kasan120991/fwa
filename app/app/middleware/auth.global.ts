// Gate every route behind auth. The session lives in an httpOnly cookie on the
// API origin, which SSR can't read, so enforcement is client-side (the
// auth.client plugin populates user state before this runs).
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const user = useAuthUser()
  const isLoginPage = to.path === '/login'

  if (!user.value && !isLoginPage) {
    return navigateTo('/login')
  }
  if (user.value && isLoginPage) {
    return navigateTo('/')
  }
})
