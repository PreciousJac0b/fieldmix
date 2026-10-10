import { describe, expect, it } from 'vitest'
import { applyWhiteBalance, PAPER_TARGET, sampleMedian, whiteBalanceGains } from '../src/color/swatches.ts'
import { makeImage } from './helpers.ts'

describe('sampleMedian', () => {
  it('returns the per-channel median of a 15 × 15 square, ignoring outliers', () => {
    // Uniform swatch with a few bright specks (glare) inside the sample square.
    const img = makeImage(40, 40, (x, y) => ((x + y) % 23 === 0 ? [255, 255, 255] : [120, 60, 30]))
    expect(sampleMedian(img, 20, 20, 15)).toEqual([120, 60, 30])
  })

  it('clips the square at image edges', () => {
    const img = makeImage(10, 10, (x) => (x < 5 ? [10, 10, 10] : [200, 200, 200]))
    expect(sampleMedian(img, 0, 0, 5)).toEqual([10, 10, 10])
    expect(sampleMedian(img, 9, 9, 5)).toEqual([200, 200, 200])
  })

  it('uses 5 × 5 for the eyedropper size', () => {
    const img = makeImage(20, 20, (x) => (x === 10 ? [0, 0, 255] : [255, 0, 0]))
    // Column x = 10 is 5 of 25 samples, so the median ignores it.
    expect(sampleMedian(img, 10, 10, 5)).toEqual([255, 0, 0])
  })

  it('throws for a tap outside the image', () => {
    const img = makeImage(5, 5, () => [0, 0, 0])
    expect(() => sampleMedian(img, 50, 50)).toThrow(RangeError)
  })
})

describe('white balance', () => {
  it('maps the paper sample to sRGB (245, 245, 245)', () => {
    const paper: [number, number, number] = [230, 220, 190] // warm indoor light
    const gains = whiteBalanceGains(paper)
    expect(applyWhiteBalance(paper, gains)).toEqual([PAPER_TARGET, PAPER_TARGET, PAPER_TARGET])
  })

  it('scales in linear light, not in sRGB', () => {
    const gains = whiteBalanceGains([200, 200, 200])
    // 200 → 245 in sRGB is a linear gain of 0.9131 / 0.5776 ≈ 1.5810, not 245 / 200 = 1.225.
    expect(gains[0]).toBeCloseTo(1.581, 3)
    // A darker grey under the same light moves by the same linear factor:
    // sRGB 100 → linear 0.1274 → × 1.581 = 0.2015 → sRGB 124.
    expect(applyWhiteBalance([100, 100, 100], gains)).toEqual([124, 124, 124])
  })

  it('removes a color cast from a swatch', () => {
    const gains = whiteBalanceGains([245, 245, 200]) // blue channel weak
    const out = applyWhiteBalance([100, 100, 80], gains)
    expect(out[0]).toBe(100)
    expect(out[1]).toBe(100)
    expect(out[2]).toBeGreaterThan(80)
  })
})
