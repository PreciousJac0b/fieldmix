import { describe, expect, it } from 'vitest'
import { adjustmentTips, eyedropper, NO_FIX_MESSAGE, resolveTestDab, type DabFeedback } from '../src/color/adjust.ts'
import { chroma, deltaE2000, hexToLab, type Lab } from '../src/color/lab.ts'
import { mixPaints } from '../src/color/mix.ts'
import { EVAL_PALETTES, TITANIUM_WHITE, type Paint } from '../src/color/paints.ts'
import type { RecipePart } from '../src/color/recipes.ts'
import { makeImage } from './helpers.ts'

const student = EVAL_PALETTES.student
const hexOf = (id: string) => student.find((p) => p.id === id)!.hex
const mixOf = (parts: RecipePart[], palette: Paint[] = student): Lab =>
  mixPaints(parts.map((p) => ({ hex: palette.find((q) => q.id === p.paint_id)!.hex, parts: p.parts }))).lab

// A muted mid green made from the student palette.
const GREEN: RecipePart[] = [
  { paint_id: 'cad-yellow-light', parts: 2 },
  { paint_id: 'ultramarine', parts: 1 },
  { paint_id: 'titanium-white', parts: 2 },
  { paint_id: 'burnt-sienna', parts: 1 },
]

describe('resolveTestDab: one test per feedback button', () => {
  const before = mixOf(GREEN)

  it('Too light picks a change that lowers L', () => {
    const r = resolveTestDab(GREEN, 'too_light', student)
    expect(r.kind).toBe('change')
    if (r.kind === 'change') expect(mixOf(r.parts)[0]).toBeLessThan(before[0] - 0.99)
  })

  it('Too dark picks a change that raises L', () => {
    const r = resolveTestDab(GREEN, 'too_dark', student)
    expect(r.kind).toBe('change')
    if (r.kind === 'change') expect(mixOf(r.parts)[0]).toBeGreaterThan(before[0] + 0.99)
  })

  it('Too dull picks a change that raises chroma', () => {
    const r = resolveTestDab(GREEN, 'too_dull', student)
    expect(r.kind).toBe('change')
    if (r.kind === 'change') expect(chroma(mixOf(r.parts))).toBeGreaterThan(chroma(before) + 0.99)
  })

  it('Too bright picks a change that lowers chroma', () => {
    const r = resolveTestDab(GREEN, 'too_bright', student)
    expect(r.kind).toBe('change')
    if (r.kind === 'change') expect(chroma(mixOf(r.parts))).toBeLessThan(chroma(before) - 0.99)
  })

  it('Looks right keeps the recipe unchanged', () => {
    const r = resolveTestDab(GREEN, 'looks_right', student)
    expect(r.kind).toBe('keep')
    expect(r.parts).toEqual(GREEN)
  })

  it('adds exactly one extra part of exactly one paint', () => {
    for (const fb of ['too_light', 'too_dark', 'too_dull', 'too_bright'] as DabFeedback[]) {
      const r = resolveTestDab(GREEN, fb, student)
      if (r.kind !== 'change') continue
      const total = (p: RecipePart[]) => p.reduce((s, q) => s + q.parts, 0)
      expect(total(r.parts)).toBe(total(GREEN) + 1)
      expect(r.add.parts).toBe(1)
      expect(deltaE2000(r.result_lab, mixOf(r.parts))).toBeLessThan(0.01)
    }
  })

  it('may suggest a paint that is not in the recipe yet', () => {
    // A single-paint recipe can only change by adding a new paint.
    const blueOnly: RecipePart[] = [{ paint_id: 'ultramarine', parts: 1 }]
    const r = resolveTestDab(blueOnly, 'too_dark', student)
    expect(r.kind).toBe('change')
    if (r.kind === 'change') expect(r.add.paint_id).not.toBe('ultramarine')
  })

  it('prefers keeping the hue: Too dark on a blue tint adds white', () => {
    const blueTint: RecipePart[] = [
      { paint_id: 'ultramarine', parts: 3 },
      { paint_id: 'titanium-white', parts: 1 },
    ]
    const r = resolveTestDab(blueTint, 'too_dark', student)
    expect(r.kind).toBe('change')
    if (r.kind === 'change') expect(r.add.paint_id).toBe('titanium-white')
  })

  it('reports "no single-part fix" when the palette cannot move the mix that way', () => {
    const whiteOnly: Paint[] = [TITANIUM_WHITE]
    const recipe: RecipePart[] = [{ paint_id: 'titanium-white', parts: 1 }]
    for (const fb of ['too_light', 'too_dark', 'too_dull', 'too_bright'] as DabFeedback[]) {
      const r = resolveTestDab(recipe, fb, whiteOnly)
      expect(r.kind).toBe('no_fix')
      expect(r.message).toBe(NO_FIX_MESSAGE)
    }
  })
})

describe('adjustmentTips', () => {
  it('lighter than target by more than 5 → add the darkest paint', () => {
    const tips = adjustmentTips([40, 0, 0], [50, 0, 0], student)
    expect(tips.map((t) => t.kind)).toEqual(['too_light'])
    const darkest = [...student].sort((a, b) => hexToLab(a.hex)[0] - hexToLab(b.hex)[0])[0]
    expect(tips[0].paint_id).toBe(darkest.id)
  })

  it('darker than target → add white, or the lightest paint without white', () => {
    expect(adjustmentTips([60, 0, 0], [50, 0, 0], student)[0].paint_id).toBe('titanium-white')
    const noWhite = student.filter((p) => p.id !== 'titanium-white')
    expect(adjustmentTips([60, 0, 0], [50, 0, 0], noWhite)[0].paint_id).toBe('cad-yellow-light')
  })

  it('within tolerance → no tips', () => {
    expect(adjustmentTips([50, 20, 20], [53, 22, 21], student)).toEqual([])
  })

  it('chroma too high → touch of the paint closest to the complement', () => {
    // A vivid orange mix for a duller orange target: the complement is blue.
    const tips = adjustmentTips([60, 20, 30], [60, 35, 50], student)
    const vivid = tips.find((t) => t.kind === 'too_vivid')!
    expect(['ultramarine', 'phthalo-blue']).toContain(vivid.paint_id)
  })

  it('hue off by more than 15° → names the paint that pulls it back', () => {
    // Target is yellow-green, the mix is a bluish green: pull toward yellow.
    const target = hexToLab('#8faa3a')
    const mix = hexToLab('#3a9a7a')
    const tip = adjustmentTips(target, mix, student).find((t) => t.kind === 'hue_off')!
    expect(tip.paint_id).toBe('cad-yellow-light')
  })
})

describe('eyedropper', () => {
  it('samples a 5 × 5 median and returns 2 recipes for that exact color', () => {
    const img = makeImage(20, 20, (x, y) => (x === 10 && y === 10 ? [255, 0, 255] : [107, 143, 78]))
    const res = eyedropper(img, 10, 10, student)
    expect(res.target_hex).toBe('#6b8f4e')
    expect(res.options).toHaveLength(2)
    expect(res.options[0].delta_e).toBeLessThan(5)
    expect(hexOf('ultramarine')).toBeTruthy()
  })
})
