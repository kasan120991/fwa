export interface AuthUser {
  id: number
  email: string
  name: string
  avatar_url?: string | null
  role: 'admin' | 'client'
}

/** Current authenticated user (null when logged out). */
export function useAuthUser() {
  return useState<AuthUser | null>('auth:user', () => null)
}

export function useAuth() {
  const user = useAuthUser()
  const api = useApi()

  async function login(email: string, password: string) {
    const { user: u } = await api<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: { email, password }
    })
    user.value = u
    return u
  }

  /**
   * Start a session as the demo account (no credentials). Only the demo
   * instance's API answers this — everywhere else it 404s.
   */
  async function demoLogin() {
    const { user: u } = await api<{ user: AuthUser }>('/auth/demo-login', { method: 'POST' })
    user.value = u
    return u
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
    }
  }

  /** Refresh the user from the session cookie; clears state if invalid. */
  async function fetchMe() {
    try {
      const { user: u } = await api<{ user: AuthUser }>('/auth/me')
      user.value = u
    } catch {
      user.value = null
    }
    return user.value
  }

  return { user, login, demoLogin, logout, fetchMe }
}
