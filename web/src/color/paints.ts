/**
 * Preset paints for the quick-palette path and the eval palettes.
 *
 * Hex values are approximations of typical student-grade acrylic tints, not
 * measurements of any brand. The UI says so and points to swatch scanning for accuracy.
 */

export interface Paint {
  id: string
  name: string
  hex: string
}

export const TITANIUM_WHITE: Paint = { id: 'titanium-white', name: 'Titanium White', hex: '#f4f3ee' }
export const MARS_BLACK: Paint = { id: 'mars-black', name: 'Mars Black', hex: '#1c1b1a' }

/** The 6-paint student set (add Titanium White for the Phase 1 palette). */
export const STUDENT_SET: Paint[] = [
  { id: 'cad-yellow-light', name: 'Cadmium Yellow Light Hue', hex: '#f9d71c' },
  { id: 'cad-red', name: 'Cadmium Red Hue', hex: '#d93a2b' },
  { id: 'alizarin', name: 'Alizarin Crimson Hue', hex: '#7e1c2e' },
  { id: 'ultramarine', name: 'Ultramarine Blue', hex: '#243b8f' },
  { id: 'phthalo-blue', name: 'Phthalo Blue', hex: '#0d3b78' },
  { id: 'burnt-sienna', name: 'Burnt Sienna', hex: '#8a3b22' },
]

/** About ten more common colors for the quick palette. */
export const EXTRA_PAINTS: Paint[] = [
  { id: 'yellow-ochre', name: 'Yellow Ochre', hex: '#c79a2e' },
  { id: 'lemon-yellow', name: 'Lemon Yellow', hex: '#f4e33a' },
  { id: 'raw-sienna', name: 'Raw Sienna', hex: '#b36b2a' },
  { id: 'burnt-umber', name: 'Burnt Umber', hex: '#5a3a24' },
  { id: 'raw-umber', name: 'Raw Umber', hex: '#6b5536' },
  { id: 'quin-magenta', name: 'Quinacridone Magenta', hex: '#9e1f5e' },
  { id: 'dioxazine-purple', name: 'Dioxazine Purple', hex: '#3b1e5a' },
  { id: 'phthalo-green', name: 'Phthalo Green', hex: '#0e5a4a' },
  { id: 'sap-green', name: 'Sap Green', hex: '#4f6b2a' },
  { id: 'cerulean', name: 'Cerulean Blue Hue', hex: '#2a7ab8' },
  { id: 'paynes-grey', name: "Payne's Grey", hex: '#36424d' },
]

/** Every preset, for the quick-palette checklist. */
export const PRESET_PAINTS: Paint[] = [...STUDENT_SET, TITANIUM_WHITE, MARS_BLACK, ...EXTRA_PAINTS]

const byId = (id: string): Paint => {
  const p = PRESET_PAINTS.find((q) => q.id === id)
  if (!p) throw new Error(`unknown preset paint ${id}`)
  return p
}

/** The three palettes `scripts/eval.ts` runs against. */
export const EVAL_PALETTES: Record<string, Paint[]> = {
  student: [...STUDENT_SET, TITANIUM_WHITE],
  primaries_wb: ['cad-yellow-light', 'cad-red', 'ultramarine', 'titanium-white', 'mars-black'].map(byId),
  minimal4: ['cad-yellow-light', 'alizarin', 'ultramarine', 'titanium-white'].map(byId),
}
