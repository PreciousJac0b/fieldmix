/**
 * Deterministic fallback planner: a line-by-line port of server/app/fallback.py, used
 * when the backend is unreachable. Both are tested against fixtures/planner_parity.json,
 * so change them together.
 */

import type { Medium, PlanOutput, PlanRegion, PlanRequest, Step } from '../api.ts'

const TIPS: Record<Medium, string[]> = {
  acrylic: [
    'Acrylic dries fast, so mix enough for the whole shape before you start.',
    'Use the largest brush that fits the shape; save small brushes for the end.',
    'Blend edges while both colors are still wet.',
  ],
  oil: [
    'Keep early layers thin and later layers thicker (fat over lean).',
    'Use the largest brush that fits the shape; save small brushes for the end.',
    'Wipe your brush between colors to keep mixes clean.',
  ],
  gouache: [
    'Gouache can dry a little lighter or darker, so test on the canvas edge first.',
    'Keep the paint creamy, not watery, for flat even coverage.',
    "Don't overwork a layer; let it dry before painting on top.",
  ],
  watercolor: [
    'Let each wash dry before painting right next to it, or the colors will bleed.',
    'Leave the paper bare wherever you want the brightest whites.',
    'Load the brush fully and work quickly to avoid streaks.',
  ],
}

function hueDeg(r: PlanRegion): number {
  const h = (Math.atan2(r.lab[2], r.lab[1]) * 180) / Math.PI
  return h < 0 ? h + 360 : h
}

/** A plain-language label from color and position alone (same rules as the Python port). */
export function guessLabel(r: PlanRegion, height: number): string {
  const [lightness, a, b] = r.lab
  const chroma = Math.hypot(a, b)
  const yRel = r.centroid[1] / height
  if (chroma < 10) {
    if (lightness > 80) return yRel < 0.4 ? 'clouds and highlights' : 'highlights'
    if (lightness < 30) return 'deep shadows'
    return 'soft greys'
  }
  const h = hueDeg(r)
  if (h >= 180 && h < 300) {
    if (yRel < 0.45) return lightness > 70 ? 'pale sky' : 'sky'
    return 'water'
  }
  if (h >= 100 && h < 180) return lightness < 40 ? 'dark foliage' : 'foliage'
  if (h >= 60 && h < 100) return lightness > 70 ? 'light ground' : 'yellow-green ground'
  if (h >= 20 && h < 60) return lightness < 60 ? 'warm earth' : 'sand and light earth'
  return lightness < 40 ? 'dark warm accents' : 'warm accents'
}

/** Compare tuples the way Python does (element by element). */
function cmpTuple(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  return 0
}

function order(req: PlanRequest, height: number): PlanRegion[] {
  const regions = [...req.regions]
  if (req.medium === 'watercolor') {
    return regions.sort((x, y) => cmpTuple([-x.lab[0], x.centroid[1], x.id], [-y.lab[0], y.centroid[1], y.id]))
  }
  const band = (r: PlanRegion) => Math.min(3, Math.floor((4 * r.centroid[1]) / height))
  return regions.sort((x, y) => cmpTuple([band(x), x.lab[0], x.id], [band(y), y.lab[0], y.id]))
}

/** Split `total` minutes by weight (largest remainder), at least 1 each. */
function allocate(total: number, weights: number[]): number[] {
  const s = weights.reduce((acc, w) => acc + w, 0) || 1.0
  const raw = weights.map((w) => (total * w) / s)
  const out = raw.map((x) => Math.floor(x))
  const left = total - out.reduce((acc, m) => acc + m, 0)
  const byRemainder = raw.map((_, i) => i).sort((i, j) => cmpTuple([-(raw[i] - out[i]), i], [-(raw[j] - out[j]), j]))
  for (const i of byRemainder.slice(0, Math.max(0, left))) out[i] += 1
  return out.map((m) => Math.max(1, m))
}

/** Build a plan without the model: one step per region plus a details step. */
export function fallbackPlan(req: PlanRequest): PlanOutput {
  const height = Math.max(...req.regions.map((r) => r.bbox[1] + r.bbox[3])) || 1.0
  const labels = new Map(req.regions.map((r) => [r.id, guessLabel(r, height)]))
  const ordered = order(req, height)
  const tips = TIPS[req.medium]
  const watercolor = req.medium === 'watercolor'

  const addDetails = ordered.length <= 9
  const detailsMinutes = addDetails ? Math.max(1, Math.floor((req.minutes * 15 + 50) / 100)) : 0
  const blockMinutes = allocate(req.minutes - detailsMinutes, ordered.map((r) => r.area_pct))

  const steps: Step[] = ordered.map((region, i) => {
    const label = labels.get(region.id)!
    const instruction = watercolor
      ? `Mix the ${label} color shown below with plenty of water. Lay a flat wash over region ${region.id}, leaving any lighter areas untouched.`
      : `Mix the ${label} color shown below. Block in region ${region.id} with broad strokes, covering the whole shape before refining edges.`
    return {
      order: i + 1,
      region_ids: [region.id],
      title: `${label[0].toUpperCase()}${label.slice(1)} (region ${region.id})`,
      instruction,
      technique_tip: tips[i % tips.length],
      est_minutes: blockMinutes[i],
    }
  })

  if (addDetails) {
    const lightest = req.regions.reduce((best, r) => (cmpTuple([r.lab[0], -r.id], [best.lab[0], -best.id]) > 0 ? r : best))
    const darkest = req.regions.reduce((best, r) => (cmpTuple([r.lab[0], r.id], [best.lab[0], best.id]) < 0 ? r : best))
    steps.push({
      order: steps.length + 1,
      region_ids: lightest.id === darkest.id ? [lightest.id] : [darkest.id, lightest.id],
      title: 'Details and highlights',
      instruction:
        'Switch to a small brush. Add the darkest accents first, then the brightest highlights. Stop while it still looks fresh.',
      technique_tip: 'Step back from the canvas every few minutes to judge the whole picture.',
      est_minutes: detailsMinutes,
    })
  }

  return { labels: req.regions.map((r) => ({ region_id: r.id, label: labels.get(r.id)! })), steps }
}
