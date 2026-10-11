/**
 * Turn an image into a handful of paintable color regions:
 * k-means in Lab → merge clusters closer than ΔE00 6 → absorb specks under 1% area.
 */

import { kmeans } from './kmeans.ts'
import { deltaE2000, labToHex, rgbaBufferToLab, type Lab } from './lab.ts'

/** Anything shaped like ImageData. */
export interface PixelImage {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

/** One paintable region, matching the /api/plan region contract (plus a label anchor). */
export interface Region {
  id: number
  hex: string
  lab: Lab
  area_pct: number
  /** Mean pixel position [x, y]. */
  centroid: [number, number]
  /** Bounding box [x, y, w, h] in pixels. */
  bbox: [number, number, number, number]
  /** A pixel inside the region nearest its centroid, for drawing the region number. */
  label_point: [number, number]
}

export interface RegionOptions {
  k?: number
  seed?: number
  mergeDeltaE?: number
  minAreaPct?: number
}

export interface RegionResult {
  regions: Region[]
  /** Region index (0-based, into `regions`) per pixel. */
  labelMap: Uint8Array
  width: number
  height: number
}

interface Cluster {
  lab: Lab
  count: number
  members: number[] // original k-means cluster indices
}

function weightedMerge(a: Cluster, b: Cluster): Cluster {
  const n = a.count + b.count
  const lab: Lab = [0, 1, 2].map((c) => (a.lab[c] * a.count + b.lab[c] * b.count) / n) as Lab
  return { lab, count: n, members: [...a.members, ...b.members] }
}

/** Merge the closest pair of clusters while their ΔE00 is below `threshold`. */
function mergeClose(clusters: Cluster[], threshold: number): Cluster[] {
  const list = [...clusters]
  for (;;) {
    let bi = -1
    let bj = -1
    let bd = threshold
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = deltaE2000(list[i].lab, list[j].lab)
        if (d < bd) {
          bd = d
          bi = i
          bj = j
        }
      }
    }
    if (bi < 0) return list
    list[bi] = weightedMerge(list[bi], list[bj])
    list.splice(bj, 1)
  }
}

/** Absorb clusters under `minCount` pixels into their nearest (ΔE00) remaining cluster. */
function absorbSmall(clusters: Cluster[], minCount: number): Cluster[] {
  const list = [...clusters]
  for (;;) {
    if (list.length <= 1) return list
    let si = -1
    for (let i = 0; i < list.length; i++) {
      if (list[i].count < minCount && (si < 0 || list[i].count < list[si].count)) si = i
    }
    if (si < 0) return list
    const small = list[si]
    let ni = -1
    let nd = Infinity
    for (let i = 0; i < list.length; i++) {
      if (i === si) continue
      const d = deltaE2000(small.lab, list[i].lab)
      if (d < nd) {
        nd = d
        ni = i
      }
    }
    list[ni] = weightedMerge(list[ni], small)
    list.splice(si, 1)
  }
}

/**
 * Extract regions from an image (already downscaled to ~512 px on the long edge).
 * Regions are sorted by area, largest first, with ids starting at 1.
 */
export function extractRegions(img: PixelImage, opts: RegionOptions = {}): RegionResult {
  const { width, height } = img
  const n = width * height
  const lab = rgbaBufferToLab(img.data)
  const km = kmeans(lab, { k: opts.k ?? 6, seed: opts.seed ?? 1 })

  let clusters: Cluster[] = []
  for (let j = 0; j < km.counts.length; j++) {
    clusters.push({
      lab: [km.centroids[j * 3], km.centroids[j * 3 + 1], km.centroids[j * 3 + 2]],
      count: km.counts[j],
      members: [j],
    })
  }
  clusters = mergeClose(clusters, opts.mergeDeltaE ?? 6)
  clusters = absorbSmall(clusters, (n * (opts.minAreaPct ?? 1)) / 100)
  clusters.sort((a, b) => b.count - a.count)

  // Map original k-means clusters to final regions.
  const kmToRegion = new Uint8Array(km.counts.length)
  clusters.forEach((c, r) => c.members.forEach((m) => (kmToRegion[m] = r)))

  const labelMap = new Uint8Array(n)
  const R = clusters.length
  const sumLab = new Float64Array(R * 3)
  const sumXY = new Float64Array(R * 2)
  const count = new Uint32Array(R)
  const minX = new Int32Array(R).fill(width)
  const minY = new Int32Array(R).fill(height)
  const maxX = new Int32Array(R).fill(-1)
  const maxY = new Int32Array(R).fill(-1)

  for (let i = 0; i < n; i++) {
    const r = kmToRegion[km.labels[i]]
    labelMap[i] = r
    const x = i % width
    const y = (i - x) / width
    sumLab[r * 3] += lab[i * 3]
    sumLab[r * 3 + 1] += lab[i * 3 + 1]
    sumLab[r * 3 + 2] += lab[i * 3 + 2]
    sumXY[r * 2] += x
    sumXY[r * 2 + 1] += y
    count[r]++
    if (x < minX[r]) minX[r] = x
    if (y < minY[r]) minY[r] = y
    if (x > maxX[r]) maxX[r] = x
    if (y > maxY[r]) maxY[r] = y
  }

  const cx = Array.from({ length: R }, (_, r) => sumXY[r * 2] / count[r])
  const cy = Array.from({ length: R }, (_, r) => sumXY[r * 2 + 1] / count[r])
  const anchor = placeLabels(labelMap, width, height, cx, cy)

  const regions: Region[] = clusters.map((_, r) => {
    const meanLab: Lab = [sumLab[r * 3] / count[r], sumLab[r * 3 + 1] / count[r], sumLab[r * 3 + 2] / count[r]]
    return {
      id: r + 1,
      hex: labToHex(meanLab),
      lab: meanLab,
      area_pct: Math.round((count[r] / n) * 1000) / 10,
      centroid: [Math.round(cx[r]), Math.round(cy[r])],
      bbox: [minX[r], minY[r], maxX[r] - minX[r] + 1, maxY[r] - minY[r] + 1],
      label_point: anchor[r],
    }
  })

  return { regions, labelMap, width, height }
}

/**
 * Chamfer (3-4) distance from each pixel of region `r` to the nearest pixel outside it
 * (the image border counts as outside). Non-members get 0. Units: 3 ≈ one pixel.
 */
export function regionDistance(labelMap: Uint8Array, width: number, height: number, r: number): Uint32Array {
  const d = new Uint32Array(width * height)
  const BIG = 1 << 30
  for (let i = 0; i < d.length; i++) d[i] = labelMap[i] === r ? BIG : 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : d[y * width + x])
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!d[i]) continue
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4)
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x
      if (!d[i]) continue
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4)
    }
  }
  return d
}

/** Minimum spacing between region numbers, in image pixels. */
export function labelSpacing(width: number, height: number): number {
  return Math.max(24, Math.round(0.08 * Math.min(width, height)))
}

/**
 * Where to draw each region's number: the pixel deepest inside the region (farthest
 * from its edges), ties broken toward the region's centroid, and at least
 * `labelSpacing` away from numbers already placed. Regions are placed in order
 * (largest first), so big regions get their best spot. If a region has no pixel far
 * enough from the others (tiny, crowded regions), it takes its deepest pixel anyway.
 *
 * The old rule (member pixel nearest the centroid) stacked every number in the middle
 * of line art, where each region is spread across the whole picture.
 */
export function placeLabels(labelMap: Uint8Array, width: number, height: number, cx: number[], cy: number[]): [number, number][] {
  const minSep = labelSpacing(width, height)
  const placed: [number, number][] = []
  for (let r = 0; r < cx.length; r++) {
    const dist = regionDistance(labelMap, width, height, r)
    let best = -1
    let bestD = -1
    let bestC = Infinity
    let fallback = -1
    let fallbackD = -1
    for (let i = 0; i < dist.length; i++) {
      const dv = dist[i]
      if (!dv) continue
      const x = i % width
      const y = (i - x) / width
      const c = (x - cx[r]) ** 2 + (y - cy[r]) ** 2
      if (dv > fallbackD) {
        fallbackD = dv
        fallback = i
      }
      if (dv < bestD || (dv === bestD && c >= bestC)) continue
      if (placed.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < minSep * minSep)) continue
      best = i
      bestD = dv
      bestC = c
    }
    const i = best >= 0 ? best : fallback
    const x = i % width
    placed.push([x, (i - x) / width])
  }
  return placed
}

/** Boolean mask of region boundaries (a pixel whose right or lower neighbor is in another region). */
export function outlineMask(labelMap: Uint8Array, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const v = labelMap[i]
      if ((x + 1 < width && labelMap[i + 1] !== v) || (y + 1 < height && labelMap[i + width] !== v)) mask[i] = 1
    }
  }
  return mask
}

/**
 * Draw the numbered outline overlay onto a 2D canvas context sized to the label map.
 * Browser only (uses CanvasRenderingContext2D).
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, result: RegionResult, scale = 1): void {
  const { labelMap, width, height, regions } = result
  const mask = outlineMask(labelMap, width, height)
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const x = i % width
    const y = (i - x) / width
    ctx.fillRect(x * scale, y * scale, Math.max(1, scale), Math.max(1, scale))
  }
  const fontPx = Math.max(14, Math.round(Math.min(width, height) * scale * 0.05))
  ctx.font = `bold ${fontPx}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const r of regions) {
    const [x, y] = r.label_point
    ctx.lineWidth = Math.max(3, fontPx / 5)
    ctx.strokeStyle = '#000'
    ctx.fillStyle = '#fff'
    ctx.strokeText(String(r.id), x * scale, y * scale)
    ctx.fillText(String(r.id), x * scale, y * scale)
  }
  ctx.restore()
}

/** Below this chroma a region counts as black, white or grey. */
export const NEUTRAL_CHROMA = 10

/**
 * Share of the picture (0 to 1) covered by neutral regions. A value near 1 means the
 * image is black/white/grey, typically an outline drawing or a blank sip-and-paint
 * canvas, so there are no colors to mix.
 */
export function neutralShare(regions: Region[]): number {
  const neutral = regions.filter((r) => Math.hypot(r.lab[1], r.lab[2]) < NEUTRAL_CHROMA).reduce((s, r) => s + r.area_pct, 0)
  const total = regions.reduce((s, r) => s + r.area_pct, 0) || 1
  return neutral / total
}

/** Share of neutral area above which a photo is treated as line art (outline drawing or blank canvas). */
export const LINE_ART_SHARE = 0.9

/** Lightness (L*) from which a neutral region counts as paper: the white of a page or canvas. */
export const PAPER_L = 70
/** Share of the picture that must be paper for line art. */
export const PAPER_SHARE = 0.5

/**
 * True when the picture is an outline drawing or blank canvas: (almost) all black, white
 * and grey, and mostly light paper. Being neutral isn't enough on its own: a photo in
 * dim evening light can be over 90% low-chroma greys (measured on a street at dusk, whose
 * largest region was L* 56 asphalt), but it has no dominant white paper.
 */
export function isLineArt(regions: Region[]): boolean {
  if (neutralShare(regions) < LINE_ART_SHARE) return false
  const total = regions.reduce((s, r) => s + r.area_pct, 0) || 1
  const paper = regions.filter((r) => r.lab[0] >= PAPER_L && Math.hypot(r.lab[1], r.lab[2]) < NEUTRAL_CHROMA).reduce((s, r) => s + r.area_pct, 0)
  return paper / total >= PAPER_SHARE
}
