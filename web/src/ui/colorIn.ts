/**
 * "Color it in" screen for outline drawings: pick one of your paints (optionally lightened
 * with your white), tap shapes to fill them, then paint with those colors. The chosen
 * colors become regions with exact recipes, and the normal planner takes it from there.
 */

import { buildColoringModel, DEFAULT_CLOSE_RADIUS, LINE_L, regionsFromColoring, renderColoring, shapeAt, type ColorChoice, type ColoringModel } from '../color/coloring.ts'
import { mixPaints } from '../color/mix.ts'
import { hexToRgb8 } from '../color/preview.ts'
import { classifyPalette } from '../color/recipes.ts'
import { recipeText, type ColoringState, type Session } from '../session.ts'
import { chip, h } from './dom.ts'

const LIGHTEN: [0 | 1 | 3, string][] = [
  [0, 'As is'],
  [1, 'Lighter'],
  [3, 'Pale'],
]
const LINE_RGB: [number, number, number] = [35, 35, 35]
const CANVAS_RGB: [number, number, number] = [251, 251, 248]

const GAPS: [number, string][] = [
  [3, 'Less'],
  [DEFAULT_CLOSE_RADIUS, 'Normal'],
  [7, 'More'],
]

const models = new WeakMap<ImageData, Map<number, ColoringModel>>()

function modelFor(s: Session): ColoringModel {
  const px = s.photo!.pixels
  const gap = s.coloring?.gap ?? DEFAULT_CLOSE_RADIUS
  let byGap = models.get(px)
  if (!byGap) models.set(px, (byGap = new Map()))
  let m = byGap.get(gap)
  if (!m) byGap.set(gap, (m = buildColoringModel(px, LINE_L, gap)))
  return m
}

function stateFor(s: Session): ColoringState {
  s.coloring ??= {
    fills: new Map(),
    choices: new Map(),
    history: [],
    paintId: s.palette.find((p) => classifyPalette([p]).colored.length)?.id ?? s.palette[0].id,
    lighten: 0,
    gap: DEFAULT_CLOSE_RADIUS,
  }
  return s.coloring
}

/** The current color: the chosen paint, plus 0, 1 or 3 parts of the palette's white. */
function currentChoice(s: Session, st: ColoringState): ColorChoice {
  const { white } = classifyPalette(s.palette)
  const whitePaint = white >= 0 ? s.palette[white] : null
  const lighten = whitePaint && whitePaint.id !== st.paintId ? st.lighten : 0
  const key = `${st.paintId}+w${lighten}`
  const existing = st.choices.get(key)
  if (existing) return existing
  const parts = [{ paint_id: st.paintId, parts: 1 }, ...(lighten && whitePaint ? [{ paint_id: whitePaint.id, parts: lighten }] : [])]
  const mixed = mixPaints(parts.map((p) => ({ hex: s.palette.find((q) => q.id === p.paint_id)!.hex, parts: p.parts })))
  return { key, hex: mixed.hex, lab: mixed.lab, parts }
}

function colorName(s: Session, c: ColorChoice): string {
  const base = s.palette.find((p) => p.id === c.parts[0].paint_id)?.name ?? c.parts[0].paint_id
  const w = c.parts[1]?.parts ?? 0
  return w === 0 ? base : w === 1 ? `${base}, lighter` : `${base}, pale`
}

/** Replace the session's regions and recipes with the colored-in shapes. */
export function applyColoring(s: Session): void {
  const st = s.coloring!
  const m = modelFor(s)
  const { regions, labelMap, keys } = regionsFromColoring(m, st.fills, st.choices)
  s.regions = { regions, labelMap, width: m.width, height: m.height }
  s.recipes = regions.map((r, i) => {
    const c = st.choices.get(keys[i])!
    return { target_id: r.id, closest_possible: false, options: [{ parts: c.parts, result_hex: c.hex, result_lab: c.lab, delta_e: 0 }] }
  })
  s.working = new Map(regions.map((r, i) => [r.id, st.choices.get(keys[i])!.parts]))
  s.plan = null
}

export function renderColorIn(s: Session, onPlan: () => Promise<void>): HTMLElement {
  const st = stateFor(s)
  let m = modelFor(s)
  const view = h('canvas', { width: m.width, height: m.height, 'aria-label': 'Outline drawing. Tap a shape to fill it with the selected color.' })
  const ctx = view.getContext('2d')!
  const current = h('div', { class: 'row' })
  const used = h('div')
  const paintBtn = h('button', { type: 'button', class: 'primary big full' }, 'Paint with these colors')
  const undoBtn = h('button', { type: 'button' }, 'Undo')
  const clearBtn = h('button', { type: 'button' }, 'Clear')
  const status = h('p', { class: 'muted', role: 'status' })

  const redraw = () => {
    const rgb = new Map([...st.fills].map(([shape, key]) => [shape, hexToRgb8(st.choices.get(key)!.hex)]))
    ctx.putImageData(new ImageData(renderColoring(m, rgb, LINE_RGB, CANVAS_RGB), m.width, m.height), 0, 0)
    const c = currentChoice(s, st)
    current.replaceChildren(chip(c.hex), h('strong', {}, colorName(s, c)), h('span', { class: 'muted' }, recipeText(s.palette, c.parts)))
    const counts = new Map<string, number>()
    for (const key of st.fills.values()) counts.set(key, (counts.get(key) ?? 0) + 1)
    used.replaceChildren(
      ...(counts.size ? [] : [h('p', { class: 'muted' }, 'Nothing colored yet.')]),
      ...[...counts].map(([key, nShapes]) => {
        const choice = st.choices.get(key)!
        return h(
          'div',
          { class: 'dotrow' },
          chip(choice.hex),
          h('span', { class: 'muted' }, `${nShapes} shape${nShapes > 1 ? 's' : ''}`),
          h('span', {}, h('strong', {}, colorName(s, choice)), ' — ', recipeText(s.palette, choice.parts)),
        )
      }),
    )
    paintBtn.disabled = st.fills.size === 0
    undoBtn.disabled = st.history.length === 0
    clearBtn.disabled = st.fills.size === 0
  }

  view.addEventListener('click', (e) => {
    const rect = view.getBoundingClientRect()
    const shape = shapeAt(m, ((e.clientX - rect.left) / rect.width) * m.width, ((e.clientY - rect.top) / rect.height) * m.height)
    if (shape < 0) return
    const c = currentChoice(s, st)
    st.choices.set(c.key, c)
    st.history.push({ shape, prev: st.fills.get(shape) })
    st.fills.set(shape, c.key)
    redraw()
  })
  undoBtn.addEventListener('click', () => {
    const last = st.history.pop()
    if (!last) return
    if (last.prev === undefined) st.fills.delete(last.shape)
    else st.fills.set(last.shape, last.prev)
    redraw()
  })
  clearBtn.addEventListener('click', () => {
    st.fills.clear()
    st.history = []
    redraw()
  })
  paintBtn.addEventListener('click', async () => {
    paintBtn.disabled = true
    status.textContent = 'Planning the painting order… (about 10 seconds with Gemma on the laptop)'
    try {
      applyColoring(s)
      await onPlan()
    } finally {
      paintBtn.disabled = st.fills.size === 0
      status.textContent = ''
    }
  })

  // Paint picker: your paints as chips, plus how much white to add.
  const { white } = classifyPalette(s.palette)
  const picker = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Paint' })
  for (const p of s.palette) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(p.id === st.paintId), class: 'paint-pick' }, chip(p.hex, p.name), ' ', p.name)
    b.addEventListener('click', () => {
      st.paintId = p.id
      picker.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)))
      redraw()
    })
    picker.append(b)
  }
  const lightenRow = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Add white' })
  for (const [value, label] of LIGHTEN) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(value === st.lighten) }, label)
    b.addEventListener('click', () => {
      st.lighten = value
      lightenRow.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)))
      redraw()
    })
    lightenRow.append(b)
  }
  // Gap closing: changing it re-finds the shapes, so existing fills are cleared.
  const gapRow = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Close gaps in the outline' })
  for (const [value, label] of GAPS) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(value === st.gap) }, label)
    b.addEventListener('click', () => {
      if (value === st.gap) return
      st.gap = value
      st.fills.clear()
      st.history = []
      m = modelFor(s)
      gapRow.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)))
      redraw()
    })
    gapRow.append(b)
  }
  redraw()

  return h(
    'div',
    {},
    h('h2', {}, 'Color it in'),
    h('p', {}, 'Pick one of your paints, then tap shapes on the drawing to fill them. When it looks right, Fieldmix plans the painting with exactly these colors.'),
    picker,
    white >= 0 ? h('div', {}, h('p', { class: 'muted' }, 'Add white:'), lightenRow) : '',
    h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Selected color'), current),
    h('div', { class: 'stage' }, view),
    h('div', { class: 'row', style: 'margin-top:8px' }, undoBtn, clearBtn),
    h('p', { class: 'muted' }, 'Color spilling into the next shape? Tap Undo, then close more gaps in the outline (this clears your fills):'),
    gapRow,
    h('h2', {}, 'Your colors'),
    used,
    h('p', { class: 'muted' }, 'Recipes are starting points: test a small dab first.'),
    status,
    paintBtn,
  )
}
