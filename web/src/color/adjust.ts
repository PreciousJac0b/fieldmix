/**
 * Helpers on top of the recipe search, all computed in the browser:
 * - eyedropper: top recipes for one tapped point
 * - adjustment tips: rule-based hints comparing a mix with its target
 * - test dab: re-solve after the painter reports how their real dab looks
 */

import { chroma, hexToLab, hueDeg, hueDiff, labToHex, rgb8ToLab, type Lab } from './lab.ts'
import { MixKernel } from './mix.ts'
import type { Paint } from './paints.ts'
import { classifyPalette, solveTarget, type Recipe, type RecipePart } from './recipes.ts'
import type { PixelImage } from './regions.ts'
import { sampleMedian } from './swatches.ts'

/** Thresholds from CLAUDE.md ("Adjustment tips"). */
export const LIGHTNESS_TOLERANCE = 5
export const CHROMA_TOLERANCE = 8
export const HUE_TOLERANCE_DEG = 15

// ---------------------------------------------------------------------------
// Eyedropper

export interface EyedropperResult {
  target_hex: string
  target_lab: Lab
  options: Recipe[]
}

/** Recipes for the exact color under a long-press (5 × 5 px median). */
export function eyedropper(img: PixelImage, x: number, y: number, palette: Paint[]): EyedropperResult {
  const [r, g, b] = sampleMedian(img, x, y, 5)
  const lab = rgb8ToLab(r, g, b)
  return { target_hex: labToHex(lab), target_lab: lab, options: solveTarget(palette, lab, 2) }
}

// ---------------------------------------------------------------------------
// Adjustment tips

export type TipKind = 'too_light' | 'too_dark' | 'too_vivid' | 'hue_off'

export interface Tip {
  kind: TipKind
  paint_id: string
  message: string
}

function paintLabs(palette: Paint[]): Lab[] {
  return palette.map((p) => hexToLab(p.hex))
}

/** Index of the chromatic paint whose hue is nearest `hue`, optionally only on one side of `from`. */
function nearestHuePaint(labs: Lab[], hue: number, side?: { from: number; sign: number }): number {
  let best = -1
  let bestD = Infinity
  labs.forEach((lab, i) => {
    if (chroma(lab) < 10) return
    const h = hueDeg(lab)
    if (side && Math.sign(hueDiff(side.from, h)) !== side.sign) return
    const d = Math.abs(hueDiff(hue, h))
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** Rule-based tips for moving `mix` toward `target` with the painter's own paints. */
export function adjustmentTips(target: Lab, mix: Lab, palette: Paint[]): Tip[] {
  const labs = paintLabs(palette)
  const tips: Tip[] = []
  const { white } = classifyPalette(palette)

  const dL = mix[0] - target[0]
  if (dL > LIGHTNESS_TOLERANCE) {
    const darkest = labs.reduce((best, lab, i) => (lab[0] < labs[best][0] ? i : best), 0)
    tips.push({
      kind: 'too_light',
      paint_id: palette[darkest].id,
      message: `Mix is lighter than the target. Add a touch of ${palette[darkest].name}.`,
    })
  } else if (dL < -LIGHTNESS_TOLERANCE) {
    const lightest = white >= 0 ? white : labs.reduce((best, lab, i) => (lab[0] > labs[best][0] ? i : best), 0)
    tips.push({
      kind: 'too_dark',
      paint_id: palette[lightest].id,
      message: `Mix is darker than the target. Add a little ${palette[lightest].name}.`,
    })
  }

  const dC = chroma(mix) - chroma(target)
  if (dC > CHROMA_TOLERANCE) {
    const comp = nearestHuePaint(labs, (hueDeg(mix) + 180) % 360)
    if (comp >= 0) {
      tips.push({
        kind: 'too_vivid',
        paint_id: palette[comp].id,
        message: `Mix is more vivid than the target. A touch of ${palette[comp].name} will calm it.`,
      })
    }
  }

  const bothChromatic = chroma(mix) >= CHROMA_TOLERANCE && chroma(target) >= CHROMA_TOLERANCE
  const dh = hueDiff(hueDeg(mix), hueDeg(target))
  if (bothChromatic && Math.abs(dh) > HUE_TOLERANCE_DEG) {
    let pull = nearestHuePaint(labs, hueDeg(target), { from: hueDeg(mix), sign: Math.sign(dh) })
    if (pull < 0) pull = nearestHuePaint(labs, hueDeg(target))
    if (pull >= 0) {
      tips.push({
        kind: 'hue_off',
        paint_id: palette[pull].id,
        message: `The hue is off. A little ${palette[pull].name} pulls it back toward the target.`,
      })
    }
  }
  return tips
}

// ---------------------------------------------------------------------------
// Test dab

export type DabFeedback = 'too_light' | 'too_dark' | 'too_dull' | 'too_bright' | 'looks_right'

export type DabResult =
  | { kind: 'keep'; parts: RecipePart[]; message: string }
  | { kind: 'change'; add: RecipePart; parts: RecipePart[]; result_hex: string; result_lab: Lab; message: string }
  | { kind: 'no_fix'; parts: RecipePart[]; message: string }

/** How far each piece of feedback asks the mix to move (Lab units). */
const DAB_STEP = 6
/** A change must move at least this far in the reported direction to count. */
const MIN_MOVE = 1
/**
 * Scoring weights. Missing the requested amount is cheap (the painter can add a bit
 * less); drifting on the other lightness/chroma axis costs more; changing the hue
 * costs most, because "too dark" means "the same color, lighter".
 */
const W_AMOUNT = 0.5
const W_OTHER_AXIS = 1
const W_HUE = 2

export const NO_FIX_MESSAGE = 'No single-part fix; this is the closest your paints get.'

/** Lower is better: how well moving from `before` to `after` answers the feedback. */
function dabScore(before: Lab, after: Lab, feedback: DabFeedback): number {
  const dL = after[0] - before[0]
  const dC = chroma(after) - chroma(before)
  const dAb = Math.hypot(after[1] - before[1], after[2] - before[2])
  const dH = Math.sqrt(Math.max(0, dAb * dAb - dC * dC)) // hue change in chroma units
  switch (feedback) {
    case 'too_light':
      return W_AMOUNT * Math.abs(dL + DAB_STEP) + W_OTHER_AXIS * Math.abs(dC) + W_HUE * dH
    case 'too_dark':
      return W_AMOUNT * Math.abs(dL - DAB_STEP) + W_OTHER_AXIS * Math.abs(dC) + W_HUE * dH
    case 'too_dull':
      return W_AMOUNT * Math.abs(dC - DAB_STEP) + W_OTHER_AXIS * Math.abs(dL) + W_HUE * dH
    case 'too_bright':
      return W_AMOUNT * Math.abs(dC + DAB_STEP) + W_OTHER_AXIS * Math.abs(dL) + W_HUE * dH
    default:
      return Infinity
  }
}

function movesTheRightWay(before: Lab, after: Lab, feedback: DabFeedback): boolean {
  switch (feedback) {
    case 'too_light':
      return after[0] - before[0] <= -MIN_MOVE
    case 'too_dark':
      return after[0] - before[0] >= MIN_MOVE
    case 'too_dull':
      return chroma(after) - chroma(before) >= MIN_MOVE
    case 'too_bright':
      return chroma(after) - chroma(before) <= -MIN_MOVE
    default:
      return false
  }
}

/**
 * Re-solve after a test dab: try adding one extra part of each palette paint (in the
 * recipe or not) and keep the one that best moves the mix the way the painter asked,
 * with the least drift in other directions.
 */
export function resolveTestDab(current: RecipePart[], feedback: DabFeedback, palette: Paint[]): DabResult {
  if (feedback === 'looks_right') {
    return { kind: 'keep', parts: current, message: 'Great — keep this mix.' }
  }
  const index = new Map(palette.map((p, i) => [p.id, i]))
  const kernel = new MixKernel(palette.map((p) => p.hex))
  const mixOf = (parts: RecipePart[]): Lab =>
    kernel.mixLab(
      parts.map((p) => index.get(p.paint_id)!),
      parts.map((p) => p.parts),
    )

  const before = mixOf(current)
  let best: { parts: RecipePart[]; lab: Lab; score: number; add: RecipePart } | null = null

  for (const paint of palette) {
    const parts = current.map((p) => ({ ...p }))
    const existing = parts.find((p) => p.paint_id === paint.id)
    if (existing) existing.parts += 1
    else parts.push({ paint_id: paint.id, parts: 1 })
    const lab = mixOf(parts)
    if (!movesTheRightWay(before, lab, feedback)) continue
    const score = dabScore(before, lab, feedback)
    if (!best || score < best.score) best = { parts, lab, score, add: { paint_id: paint.id, parts: 1 } }
  }

  if (!best) return { kind: 'no_fix', parts: current, message: NO_FIX_MESSAGE }
  const name = palette[index.get(best.add.paint_id)!].name
  return {
    kind: 'change',
    add: best.add,
    parts: best.parts.sort((a, b) => b.parts - a.parts),
    result_hex: labToHex(best.lab),
    result_lab: best.lab,
    message: `Add one more part of ${name}, mix, and dab again.`,
  }
}
