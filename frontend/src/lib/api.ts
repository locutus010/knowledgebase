// Dünne fetch-Hülle: hängt das CSRF-Token an, wirft ApiError mit deutscher Meldung.

let csrfToken = ''

export function setCsrfToken(token: string) {
  csrfToken = token
}

export class ApiError extends Error {
  status: number
  data: Record<string, unknown>
  constructor(status: number, message: string, data: Record<string, unknown>) {
    super(message)
    this.status = status
    this.data = data
  }
}

function messageOf(data: unknown, status: number): string {
  const detail = (data as { detail?: unknown })?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d: { feld?: string; meldung?: string }) => d.meldung ?? 'Ungültige Eingabe').join(' ')
  }
  if (status === 0) return 'Keine Verbindung zum Server.'
  return `Unerwarteter Fehler (${status}).`
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal; form?: FormData }

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, { method, headers, body, signal: opts.signal, credentials: 'same-origin' })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    window.dispatchEvent(new CustomEvent('kb:offline'))
    throw new ApiError(0, 'Keine Verbindung zum Server.', {})
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { detail: text }
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('kb:unauthorized'))
    throw new ApiError(res.status, messageOf(data, res.status), (data ?? {}) as Record<string, unknown>)
  }
  return data as T
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal })
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body })
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body })
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body })
export const del = <T = void>(path: string) => api<T>(path, { method: 'DELETE' })
export const upload = <T>(path: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api<T>(path, { method: 'POST', form })
}
