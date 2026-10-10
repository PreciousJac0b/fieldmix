/**
 * CIELAB (D65) conversions and CIEDE2000, built on culori.
 *
 * The public single-color functions call culori directly. `rgbBufferToLab` and
 * `xyzToLab` are inline fast paths for bulk work (every pixel, every candidate mix);
 * tests check them against culori.
 */

import { converter, differenceCiede2000 } from 'culori'

/** A CIELAB D65 color as [L, a, b]. */
export type Lab = [number, number, number]

const toLab65 = converter('lab65')
const toRgb = converter('rgb')
const ciede2000 = differenceCiede2000()

/** D65 white point, identical to culori's constants. */
const D65_X = 0.3127 / 0.329
const D65_Z = (1 - 0.3127 - 0.329) / 0.329
const LAB_E = 216 / 24389
const LAB_K = 24389 / 27

/** Convert an sRGB hex string (for example "#3d933e") to Lab. */
export function hexToLab(hex: string): Lab {
  const c = toLab65(hex)
  return [c.l, c.a, c.b]
}

/** Convert 8-bit sRGB channels (0 to 255) to Lab. */
export function rgb8ToLab(r: number, g: number, b: number): Lab {
  const c = toLab65({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255 })
  return [c.l, c.a, c.b]
}

/** Convert Lab to 8-bit sRGB, clamped to the displayable range. */
export function labToRgb8(lab: Lab): [number, number, number] {
  const c = toRgb({ mode: 'lab65', l: lab[0], a: lab[1], b: lab[2] })
  const ch = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
  return [ch(c.r), ch(c.g), ch(c.b)]
}

/** Convert Lab to a hex string, clamped to sRGB. */
export function labToHex(lab: Lab): string {
  return rgb8ToHex(...labToRgb8(lab))
}

/** Format 8-bit channels as "#rrggbb". */
export function rgb8ToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/** CIEDE2000 color difference between two Lab colors (culori implementation). */
export function deltaE2000(a: Lab, b: Lab): number {
  return ciede2000({ mode: 'lab65', l: a[0], a: a[1], b: a[2] }, { mode: 'lab65', l: b[0], a: b[1], b: b[2] })
}

/** Squared Euclidean (CIE76) distance; cheap prefilter before CIEDE2000. */
export function deltaE76Sq(a: Lab, b: Lab): number {
  const dl = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return dl * dl + da * da + db * db
}

/** Chroma C* of a Lab color. */
export function chroma(lab: Lab): number {
  return Math.hypot(lab[1], lab[2])
}

/** Hue angle h in degrees, 0 to 360. */
export function hueDeg(lab: Lab): number {
  const h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI
  return h < 0 ? h + 360 : h
}

/** Smallest signed difference between two hue angles, in degrees (-180 to 180]. */
export function hueDiff(from: number, to: number): number {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

/** sRGB 8-bit channel to linear light (0 to 1). */
export function srgb8ToLinear(v: number): number {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Linear light (0 to 1) to an sRGB 8-bit channel, clamped and rounded. */
export function linearToSrgb8(v: number): number {
  const c = Math.min(1, Math.max(0, v))
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.round(s * 255)
}

/** Fast XYZ (D65, Y of white = 1) to Lab, matching culori's xyz65 → lab65. */
export function xyzToLab(x: number, y: number, z: number): Lab {
  const f = (t: number) => (t > LAB_E ? Math.cbrt(t) : (LAB_K * t + 16) / 116)
  const fx = f(x / D65_X)
  const fy = f(y)
  const fz = f(z / D65_Z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const LINEAR_LUT = (() => {
  const lut = new Float64Array(256)
  for (let i = 0; i < 256; i++) lut[i] = srgb8ToLinear(i)
  return lut
})()

/**
 * Convert an RGBA byte buffer (as in ImageData.data) to a packed Lab buffer
 * of length 3 × pixel count.
 */
export function rgbaBufferToLab(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const n = rgba.length / 4
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const r = LINEAR_LUT[rgba[i * 4]]
    const g = LINEAR_LUT[rgba[i * 4 + 1]]
    const b = LINEAR_LUT[rgba[i * 4 + 2]]
    // Linear sRGB → XYZ (D65), same matrix family culori uses.
    const x = 0.4123907992659595 * r + 0.357584339383878 * g + 0.1804807884018343 * b
    const y = 0.21263900587151036 * r + 0.715168678767756 * g + 0.07219231536073371 * b
    const z = 0.01933081871559185 * r + 0.11919477979462598 * g + 0.9505321522496606 * b
    const lab = xyzToLab(x, y, z)
    out[i * 3] = lab[0]
    out[i * 3 + 1] = lab[1]
    out[i * 3 + 2] = lab[2]
  }
  return out
}
