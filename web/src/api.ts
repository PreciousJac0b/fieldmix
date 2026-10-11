/**
 * Backend client and the API contract types (see CLAUDE.md, "API contract").
 *
 * The backend URL is empty by default (same origin: Vite's /api proxy in dev, FastAPI
 * serving the PWA in field mode). Settings can point it at the laptop's LAN address.
 */

import type { Lab } from './color/lab.ts'

export type Mode = 'scene' | 'artwork'
export type Medium = 'acrylic' | 'watercolor' | 'oil' | 'gouache'

export interface PlanRegion {
  id: number
  hex: string
  lab: Lab
  area_pct: number
  centroid: [number, number]
  bbox: [number, number, number, number]
}

export interface PlanRequest {
  image_b64: string
  mode: Mode
  medium: Medium
  minutes: number
  palette: { id: string; name: string; hex: string }[]
  regions: PlanRegion[]
  recipes: { region_id: number; parts: { paint_id: string; parts: number }[]; result_hex: string; delta_e: number }[]
}

export interface Label {
  region_id: number
  label: string
}

export interface Step {
  order: number
  region_ids: number[]
  title: string
  instruction: string
  technique_tip: string
  est_minutes: number
}

export interface PlanOutput {
  labels: Label[]
  steps: Step[]
}

export interface PlanResponse extends PlanOutput {
  source: 'gemma' | 'fallback'
}

export interface Health {
  provider: string
  model: string
  tts: string
  model_ready: boolean
}

const SETTINGS_KEY = 'fieldmix.backendUrl'

/** The configured backend base URL ('' = same origin). */
export function getBackendUrl(): string {
  try {
    return localStorage.getItem(SETTINGS_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setBackendUrl(url: string): void {
  try {
    localStorage.setItem(SETTINGS_KEY, url.trim().replace(/\/+$/, ''))
  } catch {
    // Private mode: the setting just won't persist.
  }
}

async function call<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(getBackendUrl() + path, { ...init, signal: ctrl.signal })
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** GET /api/health, or null if the backend can't be reached quickly. */
export async function health(timeoutMs = 3000): Promise<Health | null> {
  try {
    return await call<Health>('/api/health', {}, timeoutMs)
  } catch {
    return null
  }
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** POST /api/plan. The server retries and falls back itself, so this only fails on network errors. */
export function requestPlan(req: PlanRequest): Promise<PlanResponse> {
  return call<PlanResponse>('/api/plan', json(req), 150_000)
}

/** POST /api/ask. */
export async function ask(question: string, plan: PlanResponse, currentStep: number, imageB64?: string): Promise<string> {
  const res = await call<{ answer: string }>(
    '/api/ask',
    json({ question, plan, current_step: currentStep, ...(imageB64 ? { image_b64: imageB64 } : {}) }),
    60_000,
  )
  return res.answer
}

export interface SuggestRequest {
  image_b64: string
  palette: { id: string; name: string; hex: string }[]
  shapes: { number: number; area_pct: number; centroid: [number, number]; bbox: [number, number, number, number] }[]
  can_lighten: boolean
}

export interface SuggestResponse {
  suggestions: { number: number; paint_id: string; lighten: 0 | 1 | 3; reason: string }[]
  source: 'gemma' | 'fallback'
}

/** POST /api/suggest-colors: Gemma picks one of the painter's paints per numbered shape. */
export function suggestColors(req: SuggestRequest): Promise<SuggestResponse> {
  return call<SuggestResponse>('/api/suggest-colors', json(req), 120_000)
}
