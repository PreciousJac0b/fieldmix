/**
 * "After" preview: the picture as it would look painted with the painter's own mixes.
 * Each region is filled with its recipe's mixed color, after a majority (mode) filter
 * turns k-means speckle into the kind of shapes a painter would actually block in.
 * Pure functions on buffers so they run in tests without a canvas.
 */

/** Parse "#rrggbb" into 8-bit channels. */
export function hexToRgb8(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) throw new RangeError(`not a #rrggbb color: ${hex}`)
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

/**
 * Majority filter on a label map: each pixel takes the most common label in the
 * (2·radius+1)² window around it (ties keep the pixel's own label). Removes specks
 * and ragged edges without moving region boundaries much.
 */
export function modeFilter(labels: Uint8Array, width: number, height: number, radius = 2): Uint8Array {
  const out = new Uint8Array(labels.length)
  let maxLabel = 0
  for (let i = 0; i < labels.length; i++) if (labels[i] > maxLabel) maxLabel = labels[i]
  const counts = new Uint16Array(maxLabel + 1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      counts.fill(0)
      for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy++) {
        const row = yy * width
        for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx++) counts[labels[row + xx]]++
      }
      const own = labels[y * width + x]
      let best = own
      for (let l = 0; l <= maxLabel; l++) if (counts[l] > counts[best]) best = l
      out[y * width + x] = best
    }
  }
  return out
}

/** RGBA pixels with every pixel set to its region's color. `colors[i]` is region index i. */
export function paintPreview(labels: Uint8Array, colors: [number, number, number][]): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(labels.length * 4)
  for (let i = 0; i < labels.length; i++) {
    const [r, g, b] = colors[labels[i]] ?? [128, 128, 128]
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  return data
}

/** Area-weighted mean of per-region ΔE (how close the whole painting gets to the photo). */
export function areaWeightedDeltaE(items: { area_pct: number; delta_e: number }[]): number {
  const area = items.reduce((s, it) => s + it.area_pct, 0)
  if (!area) return 0
  return items.reduce((s, it) => s + it.area_pct * it.delta_e, 0) / area
}
