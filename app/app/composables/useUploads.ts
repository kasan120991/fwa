// File uploads against the API's storage endpoint. `upload` POSTs a File and
// returns its stored (relative) path + metadata; `resolveUrl` turns a stored
// path into an absolute URL for rendering. Reused wherever files are handled
// (client logos now, the Files feature later).
export interface UploadResult {
  path: string
  name: string
  size: number
  mime: string
}

export function useUploads() {
  const api = useApi()
  const { public: { apiBase } } = useRuntimeConfig()
  // apiBase is e.g. http://localhost:4000/api — static files live at the origin.
  const origin = apiBase.replace(/\/api\/?$/, '')

  async function upload(file: File): Promise<UploadResult> {
    const body = new FormData()
    body.append('file', file)
    const { data } = await api<{ data: UploadResult }>('/uploads', { method: 'POST', body })
    return data
  }

  function resolveUrl(path?: string | null): string {
    if (!path) return ''
    // Pass through absolute/data/blob URLs (incl. legacy inline logos).
    if (/^(https?:|data:|blob:)/.test(path)) return path
    return origin + (path.startsWith('/') ? path : `/${path}`)
  }

  return { upload, resolveUrl }
}
