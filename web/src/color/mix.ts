/**
 * Paint mixing with spectral.js (Kubelka-Munk).
 *
 * `mixPaints` is the thin wrapper over `spectral.mix`. `MixKernel` is the same model
 * for the brute-force recipe search: it precomputes each paint's K/S curve and
 * luminance from spectral.js, and reads spectral.js's own color-matching matrix, so a
 * mix costs a few hundred multiply-adds instead of building a `Color` object.
 * Tests check the two agree.
 *
 * spectral.js 3.0 model, per wavelength band i:
 *   concentration_p = parts_p² × tintingStrength_p² × luminance_p
 *   KS_mix[i] = Σ concentration_p × KS_p[i] / Σ concentration_p
 *   R[i] = 1 + KS_mix − √(KS_mix² + 2·KS_mix)
 *   XYZ = CMF · R
 */

import spectral, { type Color as SpectralColor } from 'spectral.js'
import { xyzToLab, type Lab } from './lab.ts'

/** A paint and how many whole parts of it go into a mix. */
export interface MixPart {
  hex: string
  parts: number
}

/** Mix paints by whole-number parts with spectral.js. Returns hex and Lab. */
export function mixPaints(parts: MixPart[]): { hex: string; lab: Lab } {
  const used = parts.filter((p) => p.parts > 0)
  if (used.length === 0) throw new RangeError('mix needs at least one paint with parts > 0')
  const mixed = spectral.mix(...used.map((p): [SpectralColor, number] => [new spectral.Color(p.hex), p.parts]))
  const [x, y, z] = mixed.XYZ
  return { hex: mixed.toString().toLowerCase(), lab: xyzToLab(x, y, z) }
}

const BANDS = 38

/** spectral.js's 3 × 38 CIE matrix (D65-weighted), recovered by probing with unit reflectance curves. */
const CMF: Float64Array = (() => {
  const m = new Float64Array(3 * BANDS)
  for (let i = 0; i < BANDS; i++) {
    const unit = new Array<number>(BANDS).fill(0)
    unit[i] = 1
    const xyz = new spectral.Color(unit).XYZ
    m[i] = xyz[0]
    m[BANDS + i] = xyz[1]
    m[2 * BANDS + i] = xyz[2]
  }
  return m
})()

/** Fast spectral mixing over a fixed set of paints. */
export class MixKernel {
  readonly size: number
  private readonly ks: Float64Array // paints × BANDS
  private readonly weight: Float64Array // tintingStrength² × luminance per paint

  constructor(hexes: string[]) {
    this.size = hexes.length
    this.ks = new Float64Array(hexes.length * BANDS)
    this.weight = new Float64Array(hexes.length)
    hexes.forEach((hex, p) => {
      const c = new spectral.Color(hex)
      this.ks.set(c.KS, p * BANDS)
      this.weight[p] = c.tintingStrength ** 2 * c.luminance
    })
  }

  private readonly conc = new Float64Array(8)
  private readonly xyz = new Float64Array(3)

  /** Lab of a mix of paint indices `idx` with whole-number `parts` (first `count` entries). */
  mixLab(idx: ArrayLike<number>, parts: ArrayLike<number>, count = idx.length): Lab {
    this.mixXyz(idx, parts, count)
    return xyzToLab(this.xyz[0], this.xyz[1], this.xyz[2])
  }

  /** Write the mix's Lab into `out` at `offset` without allocating (hot path for the search). */
  mixLabInto(idx: ArrayLike<number>, parts: ArrayLike<number>, count: number, out: Float32Array, offset: number): void {
    this.mixXyz(idx, parts, count)
    const fx = labF(this.xyz[0] / D65_X)
    const fy = labF(this.xyz[1])
    const fz = labF(this.xyz[2] / D65_Z)
    out[offset] = 116 * fy - 16
    out[offset + 1] = 500 * (fx - fy)
    out[offset + 2] = 200 * (fy - fz)
  }

  private mixXyz(idx: ArrayLike<number>, parts: ArrayLike<number>, count: number): void {
    const conc = this.conc
    const ks = this.ks
    let total = 0
    for (let j = 0; j < count; j++) {
      conc[j] = parts[j] * parts[j] * this.weight[idx[j]]
      total += conc[j]
    }
    let x = 0
    let y = 0
    let z = 0
    for (let i = 0; i < BANDS; i++) {
      let k = 0
      for (let j = 0; j < count; j++) k += conc[j] * ks[idx[j] * BANDS + i]
      k /= total
      const r = 1 + k - Math.sqrt(k * k + 2 * k)
      x += CMF[i] * r
      y += CMF[BANDS + i] * r
      z += CMF[2 * BANDS + i] * r
    }
    this.xyz[0] = x
    this.xyz[1] = y
    this.xyz[2] = z
  }
}

const D65_X = 0.3127 / 0.329
const D65_Z = (1 - 0.3127 - 0.329) / 0.329
function labF(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116
}
