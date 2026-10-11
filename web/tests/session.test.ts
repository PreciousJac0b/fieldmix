import { describe, expect, it } from 'vitest'
import type { PlanResponse } from '../src/api.ts'
import { EVAL_PALETTES } from '../src/color/paints.ts'
import type { RegionResult } from '../src/color/regions.ts'
import { buildPlanRequest, newSession, quality, recipeDots, recipeText, spokenStep } from '../src/session.ts'

const palette = EVAL_PALETTES.student

describe('quality labels (Good < 5, OK 5–10, Closest possible > 10)', () => {
  it.each([
    [0, 'Good'],
    [4.99, 'Good'],
    [5, 'OK'],
    [10, 'OK'],
    [10.01, 'Closest possible'],
  ])('ΔE %f → %s', (de, label) => {
    expect(quality(de).label).toBe(label)
  })
})

describe('recipe text and dots come from the color engine', () => {
  const parts = [
    { paint_id: 'ultramarine', parts: 2 },
    { paint_id: 'titanium-white', parts: 1 },
  ]
  it('formats parts with paint names', () => {
    expect(recipeText(palette, parts)).toBe('2 parts Ultramarine Blue, 1 part Titanium White')
  })
  it('renders one dot per part', () => {
    expect(recipeDots(palette, parts).map((d) => d.dots)).toEqual(['●●', '●'])
  })
})

function sessionWithPlan() {
  const s = newSession()
  s.palette = palette
  s.regions = {
    width: 100,
    height: 100,
    labelMap: new Uint8Array(0),
    regions: [{ id: 1, hex: '#9cc3e6', lab: [77, -6, -22], area_pct: 100, centroid: [50, 20], bbox: [0, 0, 100, 40], label_point: [50, 20] }],
  } as RegionResult
  s.recipes = [{ target_id: 1, closest_possible: false, options: [{ parts: [{ paint_id: 'titanium-white', parts: 3 }, { paint_id: 'ultramarine', parts: 1 }], result_hex: '#9ab', result_lab: [70, -5, -20], delta_e: 3.1 }] }]
  s.working = new Map([[1, s.recipes[0].options[0].parts]])
  const plan: PlanResponse = {
    source: 'gemma',
    labels: [{ region_id: 1, label: 'sky' }],
    steps: [{ order: 1, region_ids: [1], title: 'Paint the sky', instruction: 'Mix the color shown and cover the top.', technique_tip: 'Use a big brush.', est_minutes: 10 }],
  }
  s.plan = plan
  return s
}

describe('spokenStep', () => {
  it("reads the model's instruction, then the computed recipe, then the tip", () => {
    const s = sessionWithPlan()
    const text = spokenStep(s, s.plan!.steps[0])
    expect(text).toBe(
      'Step 1. Paint the sky. Mix the color shown and cover the top. For the sky, start with 3 parts Titanium White, 1 part Ultramarine Blue. Use a big brush.',
    )
  })

  it('uses the adjusted recipe after test-dab feedback', () => {
    const s = sessionWithPlan()
    s.working.set(1, [{ paint_id: 'titanium-white', parts: 4 }, { paint_id: 'ultramarine', parts: 1 }])
    expect(spokenStep(s, s.plan!.steps[0])).toContain('4 parts Titanium White')
  })
})

describe('buildPlanRequest', () => {
  it('matches the API contract and strips browser-only fields', () => {
    const s = sessionWithPlan()
    s.photo = { canvas: {} as HTMLCanvasElement, pixels: {} as ImageData, jpeg768: 'abc' }
    const req = buildPlanRequest(s)
    expect(req.image_b64).toBe('abc')
    expect(req).toMatchObject({ mode: 'scene', medium: 'acrylic', minutes: 60 })
    expect(Object.keys(req.regions[0]).sort()).toEqual(['area_pct', 'bbox', 'centroid', 'hex', 'id', 'lab'])
    expect(req.recipes[0]).toEqual({ region_id: 1, parts: s.working.get(1), result_hex: '#9ab', delta_e: 3.1 })
    expect(req.palette[0]).toEqual({ id: palette[0].id, name: palette[0].name, hex: palette[0].hex })
  })

  it('sends the colored-in drawing instead of the blank one after Color it in', () => {
    const s = sessionWithPlan()
    s.photo = { canvas: {} as HTMLCanvasElement, pixels: {} as ImageData, jpeg768: 'blank-drawing' }
    s.planImage = 'colored-drawing'
    expect(buildPlanRequest(s).image_b64).toBe('colored-drawing')
  })
})
