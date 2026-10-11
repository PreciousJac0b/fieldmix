import { describe, expect, it } from 'vitest'
import { deltaE2000, hexToLab, type Lab } from '../src/color/lab.ts'
import { mixPaints } from '../src/color/mix.ts'
import { EVAL_PALETTES, PRESET_PAINTS, STUDENT_SET, TITANIUM_WHITE, type Paint } from '../src/color/paints.ts'
import {
  buildCandidates,
  classifyPalette,
  matchTarget,
  prunePalette,
  solveTarget,
  solveTargets,
  SIMPLICITY_TOLERANCE,
  simplicityLimit,
  type RecipePart,
} from '../src/color/recipes.ts'

const student = EVAL_PALETTES.student
const hexOf = (palette: Paint[], id: string) => palette.find((p) => p.id === id)!.hex

function mixOf(palette: Paint[], parts: RecipePart[]): Lab {
  return mixPaints(parts.map((p) => ({ hex: hexOf(palette, p.paint_id), parts: p.parts }))).lab
}

describe('classifyPalette', () => {
  it('finds white and black slots and leaves the rest colored', () => {
    const c = classifyPalette(PRESET_PAINTS)
    expect(PRESET_PAINTS[c.white].id).toBe('titanium-white')
    expect(PRESET_PAINTS[c.black].id).toBe('mars-black')
    expect(c.colored).toHaveLength(PRESET_PAINTS.length - 2)
  })
})

describe('buildCandidates', () => {
  it('respects limits: ≤3 colored, ≤4 components, parts 1–6, no equivalent ratios', () => {
    const set = buildCandidates(student)
    const { white } = classifyPalette(student)
    const seen = new Set<string>()
    for (let c = 0; c < set.count; c++) {
      const comps: [number, number][] = []
      for (let j = 0; j < 4; j++) {
        const byte = (set.codes[c] >>> (8 * j)) & 0xff
        if (byte & 7) comps.push([byte >> 3, byte & 7])
      }
      expect(comps.length).toBeGreaterThan(0)
      expect(comps.length).toBeLessThanOrEqual(4)
      expect(comps.filter(([i]) => i !== white).length).toBeLessThanOrEqual(3)
      for (const [, p] of comps) expect(p).toBeLessThanOrEqual(6)
      const g = comps.map(([, p]) => p).reduce((a, b) => {
        while (b) [a, b] = [b, a % b]
        return a
      })
      expect(g).toBe(1)
      const key = comps.map(([i, p]) => `${i}:${p}`).sort().join(',')
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('stored Lab values match spectral.js for sampled candidates', () => {
    const set = buildCandidates(student)
    for (let c = 0; c < set.count; c += 997) {
      const parts: RecipePart[] = []
      for (let j = 0; j < 4; j++) {
        const byte = (set.codes[c] >>> (8 * j)) & 0xff
        if (byte & 7) parts.push({ paint_id: student[byte >> 3].id, parts: byte & 7 })
      }
      const ref = mixOf(student, parts)
      for (let k = 0; k < 3; k++) expect(set.labs[c * 3 + k]).toBeCloseTo(ref[k], 2)
    }
  })
})

describe('matchTarget / solveTarget', () => {
  it('a color that is exactly one of its own recipes gets a recipe within ΔE 2, no more complex', () => {
    const exact = [
      { paint_id: 'ultramarine', parts: 2 },
      { paint_id: 'cad-yellow-light', parts: 3 },
      { paint_id: 'titanium-white', parts: 1 },
    ]
    const [best] = solveTarget(student, mixOf(student, exact))
    expect(best.delta_e).toBeLessThanOrEqual(SIMPLICITY_TOLERANCE)
    expect(best.parts.length).toBeLessThanOrEqual(exact.length)
  })

  it('returns 2 options whose result hex/lab and ΔE are consistent with their recipes', () => {
    const target = hexToLab('#6b8f4e') // a mid foliage green
    const options = solveTarget(student, target)
    expect(options).toHaveLength(2)
    for (const o of options) {
      const lab = mixOf(student, o.parts)
      expect(deltaE2000(lab, o.result_lab)).toBeLessThan(0.01)
      expect(o.delta_e).toBeCloseTo(deltaE2000(target, lab), 1)
    }
  })

  it('makes the second option use a different set of paints when possible', () => {
    const [a, b] = solveTarget(student, hexToLab('#6b8f4e'))
    const set = (r: RecipePart[]) => r.map((p) => p.paint_id).sort().join(',')
    expect(set(a.parts)).not.toBe(set(b.parts))
  })

  it('only uses white and black when the palette has them', () => {
    const noWhite = STUDENT_SET
    const options = solveTarget(noWhite, hexToLab('#e8e4da'))
    for (const o of options) for (const p of o.parts) expect(p.paint_id).not.toBe('titanium-white')
  })

  it('flags closest_possible when the best ΔE is above 10', () => {
    // A vivid magenta from a palette of earth colors cannot be matched.
    const earths: Paint[] = PRESET_PAINTS.filter((p) => ['burnt-umber', 'raw-umber', 'yellow-ochre', 'titanium-white'].includes(p.id))
    const [res] = solveTargets(earths, [{ id: 1, lab: hexToLab('#e0218a') }])
    expect(res.closest_possible).toBe(true)
    const [ok] = solveTargets(student, [{ id: 2, lab: hexToLab('#6b8f4e') }])
    expect(ok.closest_possible).toBe(false)
  })

  it('picks the simplest recipe within ΔE 2 of the most accurate (checked by brute force)', () => {
    const set = buildCandidates(student)
    const complexity = (code: number) => {
      let comps = 0
      let parts = 0
      for (let j = 0; j < 4; j++) {
        const p = (code >>> (8 * j)) & 7
        if (p) {
          comps++
          parts += p
        }
      }
      return [comps, parts]
    }
    for (const hex of ['#5a8a6a', '#7f9fc4', '#c9b38a', '#5b3a29', '#b5562f', '#d8c7c0']) {
      const target = hexToLab(hex)
      const [chosen] = matchTarget(set, target, 1)
      const all = Array.from({ length: set.count }, (_, c) => ({
        de: deltaE2000(target, [set.labs[c * 3], set.labs[c * 3 + 1], set.labs[c * 3 + 2]]),
        cx: complexity(set.codes[c]),
      }))
      const bestDe = Math.min(...all.map((a) => a.de))
      const limit = simplicityLimit(bestDe)
      expect(chosen.delta_e).toBeLessThanOrEqual(limit + 0.01)
      const chosenCx = [chosen.parts.length, chosen.parts.reduce((t, p) => t + p.parts, 0)]
      const strictlySimpler = all.filter(
        (a) => a.de <= limit && (a.cx[0] < chosenCx[0] || (a.cx[0] === chosenCx[0] && a.cx[1] < chosenCx[1])),
      )
      expect(strictlySimpler, hex).toHaveLength(0)
    }
  })

  it('turns a 4-paint, 16-part sea mix into something simpler', () => {
    // The coastline sea used to come out as 6 Phthalo + 6 White + 3 Alizarin + 1 Burnt Sienna.
    const [sea] = solveTarget(student, hexToLab('#7290b4'))
    const totalParts = sea.parts.reduce((t, p) => t + p.parts, 0)
    expect(sea.parts.length <= 3 || totalParts <= 8).toBe(true)
    expect(sea.delta_e).toBeLessThan(5)
  })
})

describe('simplicityLimit', () => {
  it('allows ΔE 2 more, but never crosses into a worse quality label', () => {
    expect(simplicityLimit(1)).toBe(3)
    expect(simplicityLimit(4)).toBeLessThan(5) // stays "Good"
    expect(simplicityLimit(6)).toBe(8)
    expect(simplicityLimit(9)).toBe(10) // stays "OK"
    expect(simplicityLimit(12)).toBe(14) // already "Closest possible"
  })
})

describe('prunePalette (large palettes)', () => {
  it('keeps hue neighbors on both sides of the target, plus white and black', () => {
    const keep = prunePalette(PRESET_PAINTS, hexToLab('#5f8a3a'))
    const ids = keep.map((i) => PRESET_PAINTS[i].id)
    expect(ids).toContain('titanium-white')
    expect(ids).toContain('mars-black')
    expect(keep.length).toBeLessThanOrEqual(10)
    // A green needs something yellowish and something bluish/greenish available.
    expect(ids.some((id) => ['cad-yellow-light', 'lemon-yellow', 'yellow-ochre', 'sap-green'].includes(id))).toBe(true)
    expect(ids.some((id) => ['phthalo-green', 'phthalo-blue', 'cerulean', 'ultramarine', 'sap-green'].includes(id))).toBe(true)
  })

  it('still finds good recipes with every preset ticked', () => {
    const options = solveTarget(PRESET_PAINTS, hexToLab('#6b8f4e'))
    expect(options[0].delta_e).toBeLessThan(5)
  })
})

describe('performance', () => {
  it('solves 10 regions with 12 paints (incl. white and black) in well under 3 s unthrottled', () => {
    const palette = [...STUDENT_SET, TITANIUM_WHITE, ...PRESET_PAINTS.filter((p) => ['mars-black', 'yellow-ochre', 'sap-green', 'cerulean', 'quin-magenta'].includes(p.id))]
    expect(palette).toHaveLength(12)
    const targets = ['#7fa7d9', '#3d5a2a', '#c9b38a', '#5b3a29', '#e8e4da', '#2f3e5c', '#9a8f4a', '#b5562f', '#d8c7c0', '#1f2a1c'].map((h, i) => ({ id: i + 1, lab: hexToLab(h) }))
    const t0 = performance.now()
    const res = solveTargets(palette, targets)
    const ms = performance.now() - t0
    expect(res).toHaveLength(10)
    // Budget is 3 s at 4× CPU throttling, so require < 750 ms here.
    expect(ms).toBeLessThan(750)
  })
})
