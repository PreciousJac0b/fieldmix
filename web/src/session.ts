/**
 * The painting session: everything the screens share, plus pure helpers that turn
 * recipes into text, dots and speech. Recipe text always comes from the color engine.
 */

import type { Medium, Mode, PlanRequest, PlanResponse, Step } from './api.ts'
import type { Paint } from './color/paints.ts'
import type { RecipePart, TargetRecipes } from './color/recipes.ts'
import type { RegionResult } from './color/regions.ts'

export interface Setup {
  mode: Mode
  medium: Medium
  minutes: 30 | 60 | 90
  k: number
}

export interface Photo {
  /** 512 px copy used for regions. */
  canvas: HTMLCanvasElement
  pixels: ImageData
  /** 768 px JPEG (bare base64) sent to the model. */
  jpeg768: string
}

export interface Session {
  setup: Setup
  palette: Paint[]
  photo: Photo | null
  regions: RegionResult | null
  recipes: TargetRecipes[]
  /** Current recipe per region id (starts as the best option; test-dab feedback changes it). */
  working: Map<number, RecipePart[]>
  plan: PlanResponse | null
  /** True when the plan came from the in-browser fallback because the backend was unreachable. */
  offline: boolean
  stepIndex: number
}

export function newSession(): Session {
  return {
    setup: { mode: 'scene', medium: 'acrylic', minutes: 60, k: 6 },
    palette: [],
    photo: null,
    regions: null,
    recipes: [],
    working: new Map(),
    plan: null,
    offline: false,
    stepIndex: 0,
  }
}

/** Quality label from CLAUDE.md: Good < 5, OK 5–10, Closest possible > 10. */
export function quality(deltaE: number): { label: string; cls: string } {
  if (deltaE < 5) return { label: 'Good', cls: 'q-good' }
  if (deltaE <= 10) return { label: 'OK', cls: 'q-ok' }
  return { label: 'Closest possible', cls: 'q-closest' }
}

export function paintName(palette: Paint[], id: string): string {
  return palette.find((p) => p.id === id)?.name ?? id
}

/** "2 parts Ultramarine Blue, 1 part Titanium White". */
export function recipeText(palette: Paint[], parts: RecipePart[]): string {
  return parts.map((p) => `${p.parts} ${p.parts === 1 ? 'part' : 'parts'} ${paintName(palette, p.paint_id)}`).join(', ')
}

/** Parts as dots, e.g. "●● Ultramarine Blue". */
export function recipeDots(palette: Paint[], parts: RecipePart[]): { dots: string; name: string; hex: string }[] {
  return parts.map((p) => ({
    dots: '●'.repeat(p.parts),
    name: paintName(palette, p.paint_id),
    hex: palette.find((q) => q.id === p.paint_id)?.hex ?? '#888',
  }))
}

export function regionLabel(plan: PlanResponse | null, id: number): string {
  return plan?.labels.find((l) => l.region_id === id)?.label ?? `region ${id}`
}

/**
 * Spoken text for a step: the model's words, then the computed recipe for each region
 * (CLAUDE.md: "Gemma's instruction followed by the computed recipe").
 */
export function spokenStep(s: Session, step: Step): string {
  const recipes = step.region_ids
    .map((id) => {
      const parts = s.working.get(id)
      if (!parts) return ''
      const label = regionLabel(s.plan, id)
      return `For the ${label}, start with ${recipeText(s.palette, parts)}.`
    })
    .filter(Boolean)
  return [`Step ${step.order}. ${step.title}.`, step.instruction, ...recipes, step.technique_tip].join(' ')
}

/** The /api/plan body: the 768 px photo, regions, and each region's current recipe. */
export function buildPlanRequest(sess: Session): PlanRequest {
  return {
    image_b64: sess.photo?.jpeg768 ?? '',
    mode: sess.setup.mode,
    medium: sess.setup.medium,
    minutes: sess.setup.minutes,
    palette: sess.palette.map(({ id, name, hex }) => ({ id, name, hex })),
    regions: sess.regions!.regions.map(({ id, hex, lab, area_pct, centroid, bbox }) => ({ id, hex, lab, area_pct, centroid, bbox })),
    recipes: sess.recipes.map((r) => ({
      region_id: Number(r.target_id),
      parts: sess.working.get(Number(r.target_id)) ?? r.options[0].parts,
      result_hex: r.options[0].result_hex,
      delta_e: r.options[0].delta_e,
    })),
  }
}

