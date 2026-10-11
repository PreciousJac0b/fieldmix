/**
 * Recipe search: for each target color, find the best whole-number mixes from the
 * painter's own paints.
 *
 * Search space (per CLAUDE.md, Architecture step 4): 1 to 3 colored paints, plus
 * white and black as extra slots if the palette has them, at most 4 components,
 * parts 1 to 6, equivalent ratios removed (2:2 = 1:1). Mix results don't depend on
 * the target, so every candidate is mixed once per palette and all targets are
 * matched against that list: a CIE76 prefilter keeps the nearest few dozen, then
 * CIEDE2000 picks the winners.
 *
 * Palettes with more than 12 colored paints switch to a per-target search over
 * the paints whose hues bracket the target (plus the nearest few), since the
 * shared candidate list would grow too large.
 */

import { chroma, deltaE2000, hexToLab, hueDeg, hueDiff, labToHex, type Lab } from './lab.ts'
import { MixKernel } from './mix.ts'
import type { Paint } from './paints.ts'

export const MAX_PARTS = 6
export const MAX_COMPONENTS = 4
export const MAX_COLORED = 3
/** Above this many colored paints, prune per target instead of one shared candidate list. */
export const SHARED_LIST_LIMIT = 12
export const CLOSEST_POSSIBLE_DE = 10
const PREFILTER = 48

export interface RecipePart {
  paint_id: string
  parts: number
}

export interface Recipe {
  parts: RecipePart[]
  result_hex: string
  result_lab: Lab
  delta_e: number
}

export interface TargetRecipes {
  target_id: number | string
  options: Recipe[]
  /** True when even the best mix is more than ΔE00 10 away. */
  closest_possible: boolean
}

/** Classify palette paints: one white slot, one black slot, the rest colored. */
export function classifyPalette(palette: Paint[]): { white: number; black: number; colored: number[] } {
  const labs = palette.map((p) => hexToLab(p.hex))
  let white = -1
  let black = -1
  labs.forEach((lab, i) => {
    const neutral = chroma(lab) < 12
    if (neutral && lab[0] > 85 && (white < 0 || lab[0] > labs[white][0])) white = i
    if (neutral && lab[0] < 25 && (black < 0 || lab[0] < labs[black][0])) black = i
  })
  const colored = palette.map((_, i) => i).filter((i) => i !== white && i !== black)
  return { white, black, colored }
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b]
  return a
}

/** A packed list of candidate mixes and their Lab values. */
export interface CandidateSet {
  palette: Paint[]
  kernel: MixKernel
  /** 3 floats per candidate. */
  labs: Float32Array
  /** Per candidate, 4 bytes: (paintIndex << 3) | parts; parts 0 = empty slot. */
  codes: Uint32Array
  count: number
}

function subsets(items: number[], maxSize: number): number[][] {
  const out: number[][] = [[]]
  const rec = (start: number, cur: number[]) => {
    for (let i = start; i < items.length; i++) {
      const next = [...cur, items[i]]
      out.push(next)
      if (next.length < maxSize) rec(i + 1, next)
    }
  }
  rec(0, [])
  return out
}

/** Visit every candidate recipe (component paint indices and parts) in the search space. */
function enumerate(
  colored: number[],
  white: number,
  black: number,
  visit: (idx: number[], parts: number[]) => void,
): void {
  const extrasOptions: number[][] = [[]]
  if (white >= 0) extrasOptions.push([white])
  if (black >= 0) extrasOptions.push([black])
  if (white >= 0 && black >= 0) extrasOptions.push([white, black])
  const parts = [1, 1, 1, 1]
  for (const sub of subsets(colored, MAX_COLORED)) {
    for (const extras of extrasOptions) {
      const idx = [...sub, ...extras]
      const n = idx.length
      if (n === 0 || n > MAX_COMPONENTS) continue
      // Odometer over parts 1..MAX_PARTS for each component.
      for (let j = 0; j < n; j++) parts[j] = 1
      for (;;) {
        let g = parts[0]
        for (let j = 1; j < n && g > 1; j++) g = gcd(g, parts[j])
        if (g === 1) visit(idx, parts)
        let j = 0
        while (j < n && parts[j] === MAX_PARTS) parts[j++] = 1
        if (j === n) break
        parts[j]++
      }
    }
  }
}

/** Mix every candidate recipe for these palette indices once. */
export function buildCandidates(palette: Paint[], useIdx?: number[]): CandidateSet {
  const kernel = new MixKernel(palette.map((p) => p.hex))
  const { white, black, colored } = classifyPalette(palette)
  const pick = useIdx ? new Set(useIdx) : null
  const col = pick ? colored.filter((i) => pick.has(i)) : colored
  const w = pick && !pick.has(white) ? -1 : white
  const b = pick && !pick.has(black) ? -1 : black

  let count = 0
  enumerate(col, w, b, () => count++)
  const labs = new Float32Array(count * 3)
  const codes = new Uint32Array(count)
  let c = 0
  enumerate(col, w, b, (idx, parts) => {
    kernel.mixLabInto(idx, parts, idx.length, labs, c * 3)
    let code = 0
    for (let j = 0; j < idx.length; j++) code |= ((idx[j] << 3) | parts[j]) << (8 * j)
    codes[c++] = code >>> 0
  })
  return { palette, kernel, labs, codes, count }
}

function decode(set: CandidateSet, code: number): RecipePart[] {
  const parts: RecipePart[] = []
  for (let j = 0; j < MAX_COMPONENTS; j++) {
    const byte = (code >>> (8 * j)) & 0xff
    const n = byte & 7
    if (n) parts.push({ paint_id: set.palette[byte >> 3].id, parts: n })
  }
  return parts.sort((a, b) => b.parts - a.parts)
}

function paintSetKey(code: number): number {
  let key = 0
  for (let j = 0; j < MAX_COMPONENTS; j++) {
    const byte = (code >>> (8 * j)) & 0xff
    if (byte & 7) key |= 1 << (byte >> 3)
  }
  return key
}

/**
 * A painter would rather mix 2 paints than 4 for a difference they can't see, so among
 * recipes within this ΔE00 of the most accurate one, the simplest wins (fewest paints,
 * then fewest total parts). About 2 ΔE00 is near the limit of what is visible side by side.
 */
export const SIMPLICITY_TOLERANCE = 2

/**
 * Largest ΔE00 a simpler recipe may have, given the most accurate one: best + tolerance,
 * but never crossing into a worse quality label (Good < 5, OK ≤ 10, Closest possible).
 */
export function simplicityLimit(bestDeltaE: number): number {
  const cap = bestDeltaE < 5 ? 5 - 1e-9 : bestDeltaE <= CLOSEST_POSSIBLE_DE ? CLOSEST_POSSIBLE_DE : Infinity
  return Math.min(bestDeltaE + SIMPLICITY_TOLERANCE, cap)
}

function complexity(code: number): { components: number; parts: number } {
  let components = 0
  let parts = 0
  for (let j = 0; j < MAX_COMPONENTS; j++) {
    const n = (code >>> (8 * j)) & 7
    if (n) {
      components++
      parts += n
    }
  }
  return { components, parts }
}

/**
 * Best `n` recipes for one target from a candidate set: the simplest recipe within
 * SIMPLICITY_TOLERANCE of the most accurate one. The second option uses a different set
 * of paints when one exists, so "I don't have that color" has an answer.
 */
export function matchTarget(set: CandidateSet, target: Lab, n = 2): Recipe[] {
  const { labs, count, codes } = set
  // Keep the PREFILTER nearest (squared CIE76) separately for 1-, 2-, 3- and 4-paint
  // recipes, so simple recipes are never crowded out by complex near-perfect ones.
  const topD = Array.from({ length: MAX_COMPONENTS + 1 }, () => new Float64Array(PREFILTER).fill(Infinity))
  const topI = Array.from({ length: MAX_COMPONENTS + 1 }, () => new Int32Array(PREFILTER).fill(-1))
  const [tl, ta, tb] = target
  for (let c = 0; c < count; c++) {
    const dl = labs[c * 3] - tl
    const da = labs[c * 3 + 1] - ta
    const db = labs[c * 3 + 2] - tb
    const d = dl * dl + da * da + db * db
    const comp = complexity(codes[c]).components
    const D = topD[comp]
    const I = topI[comp]
    if (d >= D[PREFILTER - 1]) continue
    let k = PREFILTER - 1
    while (k > 0 && D[k - 1] > d) {
      D[k] = D[k - 1]
      I[k] = I[k - 1]
      k--
    }
    D[k] = d
    I[k] = c
  }
  const ranked = topI
    .flatMap((I) => Array.from(I))
    .filter((c) => c >= 0)
    .map((c) => {
      const lab: Lab = [labs[c * 3], labs[c * 3 + 1], labs[c * 3 + 2]]
      return { c, lab, de: deltaE2000(target, lab), ...complexity(codes[c]) }
    })
    .sort((a, b) => a.de - b.de)
  if (!ranked.length) return []

  const limit = simplicityLimit(ranked[0].de)
  const simplest = ranked
    .filter((r) => r.de <= limit)
    .sort((a, b) => a.components - b.components || a.parts - b.parts || a.de - b.de)

  const chosen: typeof ranked = []
  const usedSets = new Set<number>()
  for (const r of [...simplest, ...ranked]) {
    if (chosen.length >= n) break
    const key = paintSetKey(codes[r.c])
    if (usedSets.has(key)) continue
    usedSets.add(key)
    chosen.push(r)
  }
  for (const r of ranked) {
    if (chosen.length >= n) break
    if (!chosen.includes(r)) chosen.push(r)
  }
  return chosen.map((r) => ({
    parts: decode(set, set.codes[r.c]),
    result_hex: labToHex(r.lab),
    result_lab: r.lab,
    delta_e: Math.round(r.de * 100) / 100,
  }))
}

/** Pick up to `max` colored paints for a target: hue neighbors on each side plus the nearest overall. */
export function prunePalette(palette: Paint[], target: Lab, max = 8): number[] {
  const { white, black, colored } = classifyPalette(palette)
  const labs = palette.map((p) => hexToLab(p.hex))
  const th = hueDeg(target)
  const chromatic = colored.filter((i) => chroma(labs[i]) >= 10)
  const plus = chromatic.filter((i) => hueDiff(th, hueDeg(labs[i])) >= 0).sort((a, b) => hueDiff(th, hueDeg(labs[a])) - hueDiff(th, hueDeg(labs[b])))
  const minus = chromatic.filter((i) => hueDiff(th, hueDeg(labs[i])) < 0).sort((a, b) => hueDiff(th, hueDeg(labs[b])) - hueDiff(th, hueDeg(labs[a])))
  const near = [...colored].sort((a, b) => deltaE2000(target, labs[a]) - deltaE2000(target, labs[b]))
  const keep: number[] = []
  const add = (i: number | undefined) => {
    if (i !== undefined && !keep.includes(i) && keep.length < max) keep.push(i)
  }
  for (let r = 0; r < 3; r++) {
    add(plus[r])
    add(minus[r])
  }
  near.forEach(add)
  return [...keep, white, black].filter((i) => i >= 0)
}

/** Cache of shared candidate sets by palette signature. */
const cache = new Map<string, CandidateSet>()

function sharedSet(palette: Paint[]): CandidateSet {
  const key = palette.map((p) => `${p.id}=${p.hex}`).join('|')
  let set = cache.get(key)
  if (!set) {
    set = buildCandidates(palette)
    cache.clear() // one palette at a time is plenty
    cache.set(key, set)
  }
  return set
}

/** Solve one target color (eyedropper path). */
export function solveTarget(palette: Paint[], target: Lab, n = 2): Recipe[] {
  const { colored } = classifyPalette(palette)
  const set = colored.length <= SHARED_LIST_LIMIT ? sharedSet(palette) : buildCandidates(palette, prunePalette(palette, target))
  return matchTarget(set, target, n)
}

/** Solve many targets (regions). */
export function solveTargets(palette: Paint[], targets: { id: number | string; lab: Lab }[], n = 2): TargetRecipes[] {
  return targets.map((t) => {
    const options = solveTarget(palette, t.lab, n)
    return { target_id: t.id, options, closest_possible: (options[0]?.delta_e ?? Infinity) > CLOSEST_POSSIBLE_DE }
  })
}
