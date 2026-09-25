/**
 * Client for the Waka Coffee Express API (backend/). All business data goes
 * through here; the Supabase client in the browser is used only to hold the
 * session (token refresh) and for realtime notification events.
 */
import { supabase } from './supabase'
import type { ListParams, ListResult } from '../types'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '')

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown
  requestId?: string

  constructor(status: number, message: string, code = 'ERROR', details?: unknown, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }
}

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error && err.message) return err.message
  return fallback
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

type Query = Record<string, unknown> | ListParams | undefined

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value))
    }
  }
  return url.toString()
}

interface RequestOptions {
  query?: Query
  body?: unknown
  auth?: boolean
  signal?: AbortSignal
}

async function send(method: string, path: string, opts: RequestOptions, retried = false): Promise<Response> {
  const headers: Record<string, string> = {}
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  if (opts.auth !== false) {
    const token = await accessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal: opts.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new ApiError(0, 'Cannot reach the Waka Coffee API. Check your connection and that the backend is running.', 'NETWORK_ERROR')
  }

  // Access tokens last an hour; refresh once transparently and retry.
  if (res.status === 401 && opts.auth !== false && !retried) {
    const { data } = await supabase.auth.refreshSession()
    if (data.session) return send(method, path, opts, true)
  }
  return res
}

async function parse<T>(res: Response): Promise<{ body: T; headers: Headers }> {
  if (res.status === 204) return { body: undefined as T, headers: res.headers }
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const e = json?.error
    throw new ApiError(
      res.status,
      e?.message ?? `Request failed (${res.status}).`,
      e?.code ?? 'HTTP_ERROR',
      e?.details,
      e?.request_id
    )
  }
  return { body: json as T, headers: res.headers }
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const { body } = await parse<{ data: T }>(await send(method, path, opts))
  return (body as { data: T } | undefined)?.data as T
}

export const api = {
  get: <T>(path: string, query?: Query, opts: Omit<RequestOptions, 'query' | 'body'> = {}) =>
    request<T>('GET', path, { ...opts, query }),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body'> = {}) =>
    request<T>('POST', path, { ...opts, body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body'> = {}) =>
    request<T>('PATCH', path, { ...opts, body: body ?? {} }),
  delete: <T = void>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body'> = {}) =>
    request<T>('DELETE', path, { ...opts, body }),

  /** List endpoints: { data, meta } */
  async list<T>(path: string, query?: Query, opts: Omit<RequestOptions, 'query' | 'body'> = {}): Promise<ListResult<T>> {
    const { body } = await parse<ListResult<T>>(await send('GET', path, { ...opts, query }))
    return { data: body?.data ?? [], meta: body?.meta ?? { total: 0, page: 1, limit: 0 } }
  },

  /** multipart/form-data upload (documents, product images) */
  upload: <T>(path: string, form: FormData, opts: Omit<RequestOptions, 'body'> = {}) =>
    request<T>('POST', path, { ...opts, body: form }),
}

/** Trigger a browser download of CSV rows (client-side export of a list). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
