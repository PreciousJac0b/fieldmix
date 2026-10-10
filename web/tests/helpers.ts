import type { PixelImage } from '../src/color/regions.ts'

/** Build an RGBA image from a function of (x, y) → [r, g, b]. */
export function makeImage(width: number, height: number, fn: (x: number, y: number) => [number, number, number]): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

/** Deterministic noise in [-amp, amp]. */
export function noise(seed: number, amp: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453
  return (s - Math.floor(s) - 0.5) * 2 * amp
}
