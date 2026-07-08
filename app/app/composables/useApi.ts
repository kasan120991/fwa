// Authed fetch to the FWA API. credentials:'include' sends the session cookie.
export function useApi() {
  const { public: { apiBase } } = useRuntimeConfig()
  return <T>(path: string, opts: Record<string, unknown> = {}) =>
    $fetch<T>(path, { baseURL: apiBase, credentials: 'include', ...opts })
}
