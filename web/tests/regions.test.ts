import { describe, expect, it } from 'vitest'
import { kmeans, mulberry32 } from '../src/color/kmeans.ts'
import { deltaE2000, rgb8ToLab } from '../src/color/lab.ts'
import { extractRegions, labelSpacing, neutralShare, outlineMask, placeLabels, regionDistance } from '../src/color/regions.ts'
import { makeImage, noise } from './helpers.ts'

describe('mulberry32', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 1000; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('kmeans', () => {
  it('finds two well-separated clusters and is repeatable with the same seed', () => {
    const pts = new Float32Array(200 * 3)
    for (let i = 0; i < 200; i++) {
      const base = i < 120 ? [30, 10, -20] : [80, -5, 40]
      pts.set([base[0] + noise(i, 1), base[1] + noise(i + 7, 1), base[2] + noise(i + 13, 1)], i * 3)
    }
    const r1 = kmeans(pts, { k: 2, seed: 3 })
    const r2 = kmeans(pts, { k: 2, seed: 3 })
    expect(Array.from(r1.labels)).toEqual(Array.from(r2.labels))
    expect([...r1.counts].sort((a, b) => a - b)).toEqual([80, 120])
    expect(r1.iterations).toBeLessThanOrEqual(20)
  })

  it('drops empty clusters when k exceeds the number of distinct colors', () => {
    const pts = new Float32Array([10, 0, 0, 10, 0, 0, 90, 0, 0, 90, 0, 0])
    const r = kmeans(pts, { k: 6, seed: 1 })
    expect(r.counts.length).toBe(2)
    expect([...r.counts]).toEqual([2, 2])
  })
})

describe('extractRegions', () => {
  // Four colors more than ΔE00 20 apart, in quadrants of different sizes, with mild noise.
  const SOURCES: [number, number, number][] = [
    [40, 90, 200], // sky blue
    [60, 150, 60], // grass green
    [200, 170, 120], // sand
    [120, 60, 40], // brown
  ]
  const img = makeImage(160, 120, (x, y) => {
    const q = (y < 50 ? 0 : 2) + (x < 100 ? 0 : 1)
    const [r, g, b] = SOURCES[q]
    const n = noise(x * 131 + y * 17, 3)
    return [r + n, g + n, b + n]
  })

  it('yields 4 regions within ΔE00 2 of their sources at the default k = 6', () => {
    for (const [a, b] of [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ]) {
      expect(deltaE2000(rgb8ToLab(...SOURCES[a]), rgb8ToLab(...SOURCES[b]))).toBeGreaterThan(20)
    }
    const { regions } = extractRegions(img, { k: 6, seed: 1 })
    expect(regions).toHaveLength(4)
    for (const src of SOURCES) {
      const lab = rgb8ToLab(...src)
      const best = Math.min(...regions.map((r) => deltaE2000(lab, r.lab)))
      expect(best).toBeLessThan(2)
    }
  })

  it('reports ids, area, centroid and bbox correctly', () => {
    const { regions, labelMap } = extractRegions(img, { k: 6, seed: 1 })
    expect(regions.map((r) => r.id)).toEqual([1, 2, 3, 4])
    expect(regions.reduce((s, r) => s + r.area_pct, 0)).toBeCloseTo(100, 0)
    // Largest quadrant: x < 100, y >= 50 → 100 × 70 = 7000 px of 19200.
    const big = regions[0]
    expect(big.area_pct).toBeCloseTo((7000 / 19200) * 100, 0)
    expect(big.bbox).toEqual([0, 50, 100, 70])
    expect(big.centroid).toEqual([50, 85])
    const [lx, ly] = big.label_point
    expect(labelMap[ly * 160 + lx]).toBe(0)
  })

  it('absorbs specks under 1% of the area', () => {
    const speckImg = makeImage(100, 100, (x, y) => (x < 3 && y < 3 ? [255, 0, 255] : x < 50 ? [20, 40, 160] : [220, 200, 60]))
    const { regions } = extractRegions(speckImg, { k: 6, seed: 1 })
    expect(regions).toHaveLength(2)
  })

  it('merges clusters closer than ΔE00 6', () => {
    // Two nearly identical greens (ΔE00 < 6) plus a red.
    const near = makeImage(100, 100, (x) => (x < 40 ? [60, 150, 60] : x < 70 ? [64, 154, 62] : [200, 40, 40]))
    const { regions } = extractRegions(near, { k: 6, seed: 1 })
    expect(regions).toHaveLength(2)
  })

  it('outline mask marks only boundaries', () => {
    const labels = new Uint8Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
    expect(Array.from(outlineMask(labels, 3, 3))).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0])
  })
})

describe('label placement', () => {
  it('chamfer distance grows toward the middle of a region', () => {
    const labels = new Uint8Array(7 * 7) // one region filling a 7 × 7 image
    const d = regionDistance(labels, 7, 7, 0)
    expect(d[0]).toBe(3) // corner touches the border
    expect(d[3 * 7 + 3]).toBe(12) // center is 4 steps in
    expect(Math.max(...d)).toBe(d[3 * 7 + 3])
  })

  it('puts the number deep inside the region, not at the centroid of scattered pixels', () => {
    // Background (region 0) with two 30 × 30 squares of region 1 at the left and right edges.
    const w = 200
    const h = 100
    const lm = new Uint8Array(w * h)
    for (let y = 35; y < 65; y++) for (let x = 0; x < 30; x++) lm[y * w + x] = 1
    for (let y = 35; y < 65; y++) for (let x = 170; x < 200; x++) lm[y * w + x] = 1
    const [, p1] = placeLabels(lm, w, h, [100, 100], [50, 50])
    // Old rule would pick a square edge nearest (100, 50); now it's well inside a square.
    expect(lm[p1[1] * w + p1[0]]).toBe(1)
    const insideLeft = p1[0] >= 10 && p1[0] <= 20
    const insideRight = p1[0] >= 180 && p1[0] <= 190
    expect(insideLeft || insideRight).toBe(true)
    expect(p1[1]).toBeGreaterThanOrEqual(45)
    expect(p1[1]).toBeLessThanOrEqual(55)
  })

  it('keeps numbers apart on line art, where every region spans the whole picture', () => {
    // White page with concentric black and grey rings (outline drawing + anti-aliasing).
    const img = makeImage(240, 300, (x, y) => {
      const r = Math.hypot(x - 120, y - 150)
      const ring = r % 24
      if (ring < 2) return [20, 20, 20]
      if (ring < 3) return [90, 90, 90]
      if (ring < 4) return [180, 180, 180]
      return [252, 252, 252]
    })
    const { regions } = extractRegions(img, { k: 6, seed: 1 })
    expect(regions.length).toBeGreaterThanOrEqual(3)
    const sep = labelSpacing(240, 300)
    for (let a = 0; a < regions.length; a++) {
      for (let b = a + 1; b < regions.length; b++) {
        const [ax, ay] = regions[a].label_point
        const [bx, by] = regions[b].label_point
        expect(Math.hypot(ax - bx, ay - by)).toBeGreaterThanOrEqual(sep)
      }
    }
  })

  it('every label sits on a pixel of its own region', () => {
    const img = makeImage(120, 90, (x, y) => (y < 30 ? [80, 140, 220] : x < 60 ? [60, 150, 60] : [200, 170, 120]))
    const { regions, labelMap } = extractRegions(img, { k: 6, seed: 1 })
    regions.forEach((r, idx) => expect(labelMap[r.label_point[1] * 120 + r.label_point[0]]).toBe(idx))
  })
})

describe('neutralShare (line-art detection)', () => {
  it('is near 1 for black/white/grey pictures and low for colorful ones', () => {
    const lineArt = makeImage(100, 100, (x) => (x % 10 < 2 ? [15, 15, 15] : [250, 250, 250]))
    expect(neutralShare(extractRegions(lineArt, { k: 6, seed: 1 }).regions)).toBeGreaterThan(0.99)
    const scene = makeImage(100, 100, (_x, y) => (y < 50 ? [90, 150, 230] : [70, 140, 60]))
    expect(neutralShare(extractRegions(scene, { k: 6, seed: 1 }).regions)).toBeLessThan(0.01)
  })
})
