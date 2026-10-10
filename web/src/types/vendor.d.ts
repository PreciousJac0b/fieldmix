// Minimal type declarations for the parts of culori and spectral.js that Fieldmix uses.
// Neither package ships its own types; these avoid adding @types/* dependencies.

declare module 'culori' {
  export interface Lab65 {
    mode: 'lab65'
    l: number
    a: number
    b: number
    alpha?: number
  }
  export interface Rgb {
    mode: 'rgb'
    r: number
    g: number
    b: number
    alpha?: number
  }
  export interface Xyz65 {
    mode: 'xyz65'
    x: number
    y: number
    z: number
    alpha?: number
  }
  export type Color = Lab65 | Rgb | Xyz65 | string

  export function converter(mode: 'lab65'): (c: Color) => Lab65
  export function converter(mode: 'rgb'): (c: Color) => Rgb
  export function converter(mode: 'xyz65'): (c: Color) => Xyz65
  export function differenceCiede2000(kl?: number, kc?: number, kh?: number): (std: Color, smp: Color) => number
  export function formatHex(c: Color): string
  export function clampRgb(c: Color): Rgb
}

declare module 'spectral.js' {
  export class Color {
    constructor(value: string | number[])
    readonly R: number[]
    readonly sRGB: number[]
    readonly lRGB: number[]
    readonly XYZ: number[]
    readonly KS: number[]
    readonly luminance: number
    tintingStrength: number
    toString(opts?: { format?: 'hex' | 'rgb'; method?: 'map' | 'clip' }): string
  }
  export function mix(...colors: [Color, number][]): Color
  const spectral: { Color: typeof Color; mix: typeof mix }
  export default spectral
}
