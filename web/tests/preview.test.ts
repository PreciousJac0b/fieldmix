import { describe, expect, it } from 'vitest'
import { areaWeightedDeltaE, hexToRgb8, modeFilter, paintPreview } from '../src/color/preview.ts'

describe('hexToRgb8', () => {
  it('parses #rrggbb in either case', () => {
    expect(hexToRgb8('#3d933e')).toEqual([61, 147, 62])
    expect(hexToRgb8('FCD200')).toEqual([252, 210, 0])
  })
  it('rejects anything else', () => {
    expect(() => hexToRgb8('#fff')).toThrow(RangeError)
  })
})

describe('modeFilter', () => {
  it('removes an isolated speck', () => {
    const w = 9
    const labels = new Uint8Array(w * w) // all region 0
    labels[4 * w + 4] = 1 // one stray pixel of region 1
    const out = modeFilter(labels, w, w, 2)
    expect(out.every((v) => v === 0)).toBe(true)
  })

  it('keeps a large region and its straight boundary in place', () => {
    const w = 20
    const h = 10
    const labels = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 10; x < w; x++) labels[y * w + x] = 2
    const out = modeFilter(labels, w, h, 2)
    expect(Array.from(out)).toEqual(Array.from(labels))
  })

  it('keeps the pixel’s own label on ties', () => {
    // 1 × 2 image, radius 1: each window holds one 0 and one 1.
    expect(Array.from(modeFilter(new Uint8Array([0, 1]), 2, 1, 1))).toEqual([0, 1])
  })
})

describe('paintPreview', () => {
  it('fills each pixel with its region color, fully opaque', () => {
    const data = paintPreview(new Uint8Array([0, 1, 1]), [
      [10, 20, 30],
      [200, 100, 50],
    ])
    expect(Array.from(data)).toEqual([10, 20, 30, 255, 200, 100, 50, 255, 200, 100, 50, 255])
  })
})

describe('areaWeightedDeltaE', () => {
  it('weights by area', () => {
    expect(areaWeightedDeltaE([{ area_pct: 75, delta_e: 2 }, { area_pct: 25, delta_e: 10 }])).toBeCloseTo(4, 10)
    expect(areaWeightedDeltaE([])).toBe(0)
  })
})
