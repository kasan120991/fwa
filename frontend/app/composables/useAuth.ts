export interface AuthUser {
  id: number
  email: string
  name: string
  role: 'admin' | 'client'
}

/** Current authenticated user (null when logged out). */
export function useAuthUser() {
  return useState<AuthUser | null>('auth:user', () => null)
}

export function useAuth() {
  const user = useAuthUser()
  const { public: { apiBase } } = useRuntimeConfig()

  // credentials:'include' so the httpOnly session cookie rides along.
  const api = <T>(path: string, opts: Record<string, unknown> = {}) =>
    $fetch<T>(path, { baseURL: apiBase, credentials: 'include', ...opts })

  async function login(email: string, password: string) {
    const { user: u } = await api<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: { email, password }
    })
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

  return { user, login, logout, fetchMe }
}
