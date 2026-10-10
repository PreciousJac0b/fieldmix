import spectral, { type Color as SpectralColor } from 'spectral.js'
import { describe, expect, it } from 'vitest'
import { hexToLab, hueDeg, xyzToLab } from '../src/color/lab.ts'
import { MixKernel, mixPaints } from '../src/color/mix.ts'
import { mulberry32 } from '../src/color/kmeans.ts'
import { PRESET_PAINTS } from '../src/color/paints.ts'

describe('mixPaints (spectral.js wrapper)', () => {
  it('reproduces the spectral.js README example (#002185 + #FCD200 → #3D933E)', () => {
    expect(mixPaints([
      { hex: '#002185', parts: 1 },
      { hex: '#FCD200', parts: 1 },
    ]).hex).toBe('#3d933e')
  })

  it('reproduces the three-color README example (→ #8D7964)', () => {
    expect(mixPaints([
      { hex: '#FCF046', parts: 1 },
      { hex: '#E53166', parts: 1 },
      { hex: '#3375DA', parts: 1 },
    ]).hex).toBe('#8d7964')
  })

  it('blue plus yellow lands at a green hue angle (90° to 180°)', () => {
    const ultramarine = PRESET_PAINTS.find((p) => p.id === 'ultramarine')!.hex
    const cadYellow = PRESET_PAINTS.find((p) => p.id === 'cad-yellow-light')!.hex
    for (const [b, y] of [
      [1, 1],
      [1, 2],
      [2, 1],
    ]) {
      const h = hueDeg(mixPaints([
        { hex: ultramarine, parts: b },
        { hex: cadYellow, parts: y },
      ]).lab)
      expect(h).toBeGreaterThan(90)
      expect(h).toBeLessThan(180)
    }
  })

  it('a single paint returns itself', () => {
    const lab = mixPaints([{ hex: '#8a3b22', parts: 3 }]).lab
    const ref = hexToLab('#8a3b22')
    for (let c = 0; c < 3; c++) expect(lab[c]).toBeCloseTo(ref[c], 0)
  })

  it('rejects an empty mix', () => {
    expect(() => mixPaints([{ hex: '#fff', parts: 0 }])).toThrow(RangeError)
  })
})

describe('MixKernel (fast path) matches spectral.mix', () => {
  it('agrees on 500 random recipes to 1e-9 in Lab', () => {
    const hexes = PRESET_PAINTS.map((p) => p.hex)
    const kernel = new MixKernel(hexes)
    const colors = hexes.map((h) => new spectral.Color(h))
    const rand = mulberry32(7)
    for (let t = 0; t < 500; t++) {
      const n = 1 + Math.floor(rand() * 4)
      const idx: number[] = []
      while (idx.length < n) {
        const i = Math.floor(rand() * hexes.length)
        if (!idx.includes(i)) idx.push(i)
      }
      const parts = idx.map(() => 1 + Math.floor(rand() * 6))
      const ref = spectral.mix(...idx.map((i, j): [SpectralColor, number] => [colors[i], parts[j]])).XYZ
      const refLab = xyzToLab(ref[0], ref[1], ref[2])
      const fast = kernel.mixLab(idx, parts)
      const out = new Float32Array(3)
      kernel.mixLabInto(idx, parts, n, out, 0)
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(fast[c] - refLab[c])).toBeLessThan(1e-9)
        expect(Math.abs(out[c] - refLab[c])).toBeLessThan(1e-3) // Float32 storage
      }
    }
  })
})
