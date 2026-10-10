import { describe, expect, it } from 'vitest'
import {
  chroma,
  deltaE2000,
  hexToLab,
  hueDeg,
  hueDiff,
  labToHex,
  linearToSrgb8,
  rgb8ToLab,
  rgbaBufferToLab,
  srgb8ToLinear,
  xyzToLab,
  type Lab,
} from '../src/color/lab.ts'

// Sharma, Wu & Dalal (2005), "The CIEDE2000 color-difference formula", Table 1.
// [L1, a1, b1, L2, a2, b2, ΔE00]. Includes the hue-wraparound pairs (9–15).
const SHARMA: [number, number, number, number, number, number, number][] = [
  [50.0, 2.6772, -79.7751, 50.0, 0.0, -82.7485, 2.0425], // pair 1
  [50.0, 3.1571, -77.2803, 50.0, 0.0, -82.7485, 2.8615], // pair 2
  [50.0, -1.3802, -84.2814, 50.0, 0.0, -82.7485, 1.0], // pair 4
  [50.0, 0.0, 0.0, 50.0, -1.0, 2.0, 2.3669], // pair 7
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0009, 7.1792], // pair 9
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0011, 7.2195], // pair 11
  [50.0, -0.001, 2.49, 50.0, 0.0009, -2.49, 4.8045], // pair 13
  [50.0, 2.5, 0.0, 73.0, 25.0, -18.0, 27.1492], // pair 17
  [50.0, 2.5, 0.0, 56.0, -27.0, -3.0, 31.903], // pair 19
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644], // pair 25
  [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146], // pair 30
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377], // pair 33
  [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082], // pair 34
]

describe('deltaE2000', () => {
  it.each(SHARMA)('matches Sharma test data (%f, %f, %f) vs (%f, %f, %f) = %f', (l1, a1, b1, l2, a2, b2, expected) => {
    expect(deltaE2000([l1, a1, b1], [l2, a2, b2])).toBeCloseTo(expected, 4)
    expect(Math.abs(deltaE2000([l1, a1, b1], [l2, a2, b2]) - expected)).toBeLessThanOrEqual(0.0001)
  })

  it('is symmetric and zero for identical colors', () => {
    const a: Lab = [40, 20, -30]
    const b: Lab = [55, -10, 12]
    expect(deltaE2000(a, a)).toBe(0)
    expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 10)
  })
})

describe('sRGB to Lab (D65)', () => {
  it('maps white, black and mid grey to known L*', () => {
    expect(hexToLab('#ffffff')[0]).toBeCloseTo(100, 3)
    expect(hexToLab('#000000')[0]).toBeCloseTo(0, 3)
    const grey = hexToLab('#808080')
    expect(grey[0]).toBeCloseTo(53.585, 2)
    expect(chroma(grey)).toBeLessThan(1e-3)
  })

  it('maps pure sRGB red to its known D65 Lab value', () => {
    const [l, a, b] = rgb8ToLab(255, 0, 0)
    expect(l).toBeCloseTo(53.24, 1)
    expect(a).toBeCloseTo(80.09, 1)
    expect(b).toBeCloseTo(67.2, 1)
  })

  it('round-trips hex through Lab', () => {
    for (const hex of ['#3d933e', '#002185', '#fcd200', '#8a3b22']) {
      expect(labToHex(hexToLab(hex))).toBe(hex)
    }
  })

  it('fast buffer conversion matches culori to 0.01', () => {
    const pixels = [
      [255, 0, 0],
      [12, 200, 77],
      [128, 128, 128],
      [250, 245, 230],
      [3, 4, 5],
    ]
    const rgba = new Uint8ClampedArray(pixels.flatMap(([r, g, b]) => [r, g, b, 255]))
    const lab = rgbaBufferToLab(rgba)
    pixels.forEach(([r, g, b], i) => {
      const ref = rgb8ToLab(r, g, b)
      for (let c = 0; c < 3; c++) expect(lab[i * 3 + c]).toBeCloseTo(ref[c], 2)
    })
  })

  it('xyzToLab maps the D65 white point to L=100, a=b=0', () => {
    const [l, a, b] = xyzToLab(0.3127 / 0.329, 1, (1 - 0.3127 - 0.329) / 0.329)
    expect(l).toBeCloseTo(100, 6)
    expect(a).toBeCloseTo(0, 6)
    expect(b).toBeCloseTo(0, 6)
  })
})

describe('helpers', () => {
  it('hue angle and signed hue difference', () => {
    expect(hueDeg([50, 10, 0])).toBeCloseTo(0, 6)
    expect(hueDeg([50, 0, 10])).toBeCloseTo(90, 6)
    expect(hueDeg([50, 0, -10])).toBeCloseTo(270, 6)
    expect(hueDiff(350, 10)).toBeCloseTo(20, 6)
    expect(hueDiff(10, 350)).toBeCloseTo(-20, 6)
  })

  it('linear/sRGB channel conversions round-trip', () => {
    for (const v of [0, 1, 10, 128, 245, 255]) expect(linearToSrgb8(srgb8ToLinear(v))).toBe(v)
    expect(srgb8ToLinear(245)).toBeCloseTo(0.9131, 4)
  })
})
