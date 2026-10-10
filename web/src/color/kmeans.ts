/**
 * k-means++ clustering of Lab pixels with a seeded RNG, so results are deterministic.
 */

/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface KMeansOptions {
  k: number
  seed?: number
  maxIter?: number
  /** Fit on at most this many sampled points, then assign every point. */
  sampleSize?: number
}

export interface KMeansResult {
  /** Packed centroids, 3 values per cluster. Only non-empty clusters are kept. */
  centroids: Float64Array
  /** Cluster index per input point. */
  labels: Uint8Array
  /** Number of input points per cluster. */
  counts: Uint32Array
  iterations: number
}

function sqDist(points: Float32Array, i: number, c: Float64Array, j: number): number {
  const dl = points[i * 3] - c[j * 3]
  const da = points[i * 3 + 1] - c[j * 3 + 1]
  const db = points[i * 3 + 2] - c[j * 3 + 2]
  return dl * dl + da * da + db * db
}

function nearest(points: Float32Array, i: number, c: Float64Array, k: number): number {
  let best = 0
  let bestD = Infinity
  for (let j = 0; j < k; j++) {
    const d = sqDist(points, i, c, j)
    if (d < bestD) {
      bestD = d
      best = j
    }
  }
  return best
}

/**
 * Cluster packed Lab points (3 floats per point) into at most `k` clusters.
 *
 * Uses k-means++ seeding and Lloyd iterations (max 20 by default). Empty clusters
 * are dropped, so the result can have fewer than `k` clusters (for example when the
 * image has fewer distinct colors than `k`).
 */
export function kmeans(points: Float32Array, opts: KMeansOptions): KMeansResult {
  const n = points.length / 3
  const k = Math.max(1, Math.min(opts.k, 255, n))
  const maxIter = opts.maxIter ?? 20
  const rand = mulberry32(opts.seed ?? 1)

  // Deterministic subsample for fitting.
  const sampleSize = Math.min(n, opts.sampleSize ?? 20000)
  const sample = new Uint32Array(sampleSize)
  for (let s = 0; s < sampleSize; s++) sample[s] = sampleSize === n ? s : Math.floor(rand() * n)

  // k-means++ seeding on the sample.
  const centroids = new Float64Array(k * 3)
  const first = sample[Math.floor(rand() * sampleSize)]
  centroids.set([points[first * 3], points[first * 3 + 1], points[first * 3 + 2]], 0)
  const minD = new Float64Array(sampleSize).fill(Infinity)
  let chosen = 1
  for (; chosen < k; chosen++) {
    let total = 0
    for (let s = 0; s < sampleSize; s++) {
      const d = sqDist(points, sample[s], centroids, chosen - 1)
      if (d < minD[s]) minD[s] = d
      total += minD[s]
    }
    if (total === 0) break // fewer distinct colors than k
    let r = rand() * total
    let pick = sample[sampleSize - 1]
    for (let s = 0; s < sampleSize; s++) {
      r -= minD[s]
      if (r <= 0) {
        pick = sample[s]
        break
      }
    }
    centroids.set([points[pick * 3], points[pick * 3 + 1], points[pick * 3 + 2]], chosen * 3)
  }
  const kk = chosen

  // Lloyd iterations on the sample.
  const assign = new Uint8Array(sampleSize)
  let iterations = 0
  for (; iterations < maxIter; iterations++) {
    let changed = iterations === 0
    for (let s = 0; s < sampleSize; s++) {
      const j = nearest(points, sample[s], centroids, kk)
      if (j !== assign[s]) {
        assign[s] = j
        changed = true
      }
    }
    const sums = new Float64Array(kk * 3)
    const cnt = new Uint32Array(kk)
    for (let s = 0; s < sampleSize; s++) {
      const j = assign[s]
      const p = sample[s] * 3
      sums[j * 3] += points[p]
      sums[j * 3 + 1] += points[p + 1]
      sums[j * 3 + 2] += points[p + 2]
      cnt[j]++
    }
    for (let j = 0; j < kk; j++) {
      if (cnt[j] === 0) continue // keep old centroid; dropped later if still empty
      centroids[j * 3] = sums[j * 3] / cnt[j]
      centroids[j * 3 + 1] = sums[j * 3 + 1] / cnt[j]
      centroids[j * 3 + 2] = sums[j * 3 + 2] / cnt[j]
    }
    if (!changed) break
  }

  // Assign every point, then drop empty clusters and reindex.
  const fullLabels = new Uint8Array(n)
  const fullCounts = new Uint32Array(kk)
  for (let i = 0; i < n; i++) {
    const j = nearest(points, i, centroids, kk)
    fullLabels[i] = j
    fullCounts[j]++
  }
  const remap = new Int16Array(kk).fill(-1)
  let kept = 0
  for (let j = 0; j < kk; j++) if (fullCounts[j] > 0) remap[j] = kept++
  const outCentroids = new Float64Array(kept * 3)
  const outCounts = new Uint32Array(kept)
  for (let j = 0; j < kk; j++) {
    const r = remap[j]
    if (r < 0) continue
    outCentroids.set(centroids.subarray(j * 3, j * 3 + 3), r * 3)
    outCounts[r] = fullCounts[j]
  }
  for (let i = 0; i < n; i++) fullLabels[i] = remap[fullLabels[i]]

  return { centroids: outCentroids, labels: fullLabels, counts: outCounts, iterations }
}
