/**
 * Sampling paint swatches from a photo: median of a small square at a tap,
 * and white balance from a tap on bare paper.
 */

import { linearToSrgb8, srgb8ToLinear } from './lab.ts'
import type { PixelImage } from './regions.ts'

export type Rgb8 = [number, number, number]

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/**
 * Per-channel median of a `size` × `size` square centered on (x, y), clipped to the image.
 * 15 px for swatch taps, 5 px for the eyedropper.
 */
export function sampleMedian(img: PixelImage, x: number, y: number, size = 15): Rgb8 {
  const half = Math.floor(size / 2)
  const cx = Math.round(x)
  const cy = Math.round(y)
  const r: number[] = []
  const g: number[] = []
  const b: number[] = []
  for (let yy = Math.max(0, cy - half); yy <= Math.min(img.height - 1, cy + half); yy++) {
    for (let xx = Math.max(0, cx - half); xx <= Math.min(img.width - 1, cx + half); xx++) {
      const i = (yy * img.width + xx) * 4
      r.push(img.data[i])
      g.push(img.data[i + 1])
      b.push(img.data[i + 2])
    }
  }
  if (r.length === 0) throw new RangeError(`tap (${x}, ${y}) is outside the image`)
  return [median(r), median(g), median(b)]
}

/** Paper maps to this sRGB value after white balance (slightly off pure white, like real paper). */
export const PAPER_TARGET = 245

/**
 * Per-channel gains in linear light that map the sampled paper color to sRGB (245, 245, 245).
 */
export function whiteBalanceGains(paper: Rgb8, target = PAPER_TARGET): [number, number, number] {
  const t = srgb8ToLinear(target)
  return paper.map((v) => t / Math.max(srgb8ToLinear(v), 1e-6)) as [number, number, number]
}

/** Apply linear-light gains to an sRGB color, clamping to 0 to 255. */
export function applyWhiteBalance(rgb: Rgb8, gains: [number, number, number]): Rgb8 {
  return rgb.map((v, c) => linearToSrgb8(srgb8ToLinear(v) * gains[c])) as Rgb8
}
