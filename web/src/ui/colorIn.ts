/**
 * "Color it in" screen for outline drawings: pick one of your paints (optionally lightened
 * with your white), tap shapes to fill them, and draw your own outlines where the
 * drawing is open (curly hair, loose strokes) so fills stop there. Then paint with those
 * colors: they become regions with exact recipes, and the normal planner takes over.
 */

import {
  buildColoringModel,
  DEFAULT_CLOSE_RADIUS,
  LINE_L,
  regionsFromColoring,
  renderColoring,
  resolveFills,
  shapeAt,
  withOutlines,
  type ColorChoice,
  type ColoringModel,
} from '../color/coloring.ts'
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
const GAPS: [number, string][] = [
  [3, 'Less'],
  [DEFAULT_CLOSE_RADIUS, 'Normal'],
  [7, 'More'],
]
const LINE_RGB: [number, number, number] = [35, 35, 35]
const CANVAS_RGB: [number, number, number] = [251, 251, 248]
/** Painter-drawn outlines show in blue so they read as "yours", not the printed drawing. */
const USER_RGB: [number, number, number] = [30, 90, 200]

const baseModels = new WeakMap<ImageData, Map<number, ColoringModel>>()

/** The drawing's own outline at this gap setting (cached), without the painter's strokes. */
function baseModel(s: Session, gap: number): ColoringModel {
  const px = s.photo!.pixels
  let byGap = baseModels.get(px)
  if (!byGap) baseModels.set(px, (byGap = new Map()))
  let m = byGap.get(gap)
  if (!m) byGap.set(gap, (m = buildColoringModel(px, LINE_L, gap)))
  return m
}

/** The full model: the drawing plus the painter's outlines. */
export function modelFor(s: Session): ColoringModel {
  const st = s.coloring!
  return withOutlines(baseModel(s, st.gap), st.strokes)
}

function stateFor(s: Session): ColoringState {
  if (!s.coloring) {
    s.coloring = {
      fills: [],
      strokes: [],
      choices: new Map(),
      history: [],
      tool: 'fill',
      paintId: s.palette.find((p) => classifyPalette([p]).colored.length)?.id ?? s.palette[0].id,
      lighten: 0,
      gap: DEFAULT_CLOSE_RADIUS,
    }
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
  const { regions, labelMap, keys } = regionsFromColoring(m, resolveFills(m, st.fills), st.choices)
  s.regions = { regions, labelMap, width: m.width, height: m.height }
  s.recipes = regions.map((r, i) => {
    const c = st.choices.get(keys[i])!
    return { target_id: r.id, closest_possible: false, options: [{ parts: c.parts, result_hex: c.hex, result_lab: c.lab, delta_e: 0 }] }
  })
  s.working = new Map(regions.map((r, i) => [r.id, st.choices.get(keys[i])!.parts]))
  s.plan = null
}

/** A segmented radio row. */
function radioRow<T>(label: string, options: [T, string][], current: () => T, onPick: (v: T) => void): HTMLElement {
  const row = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label })
  for (const [value, text] of options) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(value === current()) }, text)
    b.addEventListener('click', () => {
      onPick(value)
      row.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)))
    })
    row.append(b)
  }
  return row
}

export function renderColorIn(s: Session, onPlan: () => Promise<void>): HTMLElement {
  const st = stateFor(s)
  let m = modelFor(s)
  let fills = resolveFills(m, st.fills)
  const view = h('canvas', { width: m.width, height: m.height, 'aria-label': 'Outline drawing. Tap a shape to fill it, or switch to Draw outline and drag to add an outline.' })
  const ctx = view.getContext('2d')!
  const current = h('div', { class: 'row' })
  const used = h('div')
  const toolHint = h('p', { role: 'status' })
  const paintBtn = h('button', { type: 'button', class: 'primary big full' }, 'Paint with these colors')
  const undoBtn = h('button', { type: 'button' }, 'Undo')
  const clearBtn = h('button', { type: 'button' }, 'Clear all')
  const status = h('p', { class: 'muted', role: 'status' })

  const rebuild = () => {
    m = modelFor(s)
    fills = resolveFills(m, st.fills)
  }

  const redraw = () => {
    const rgb = new Map([...fills].map(([shape, key]) => [shape, hexToRgb8(st.choices.get(key)!.hex)]))
    ctx.putImageData(new ImageData(renderColoring(m, rgb, LINE_RGB, CANVAS_RGB, USER_RGB), m.width, m.height), 0, 0)
    const c = currentChoice(s, st)
    current.replaceChildren(chip(c.hex), h('strong', {}, colorName(s, c)), h('span', { class: 'muted' }, recipeText(s.palette, c.parts)))
    const counts = new Map<string, number>()
    for (const key of fills.values()) counts.set(key, (counts.get(key) ?? 0) + 1)
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
    toolHint.textContent =
      st.tool === 'fill'
        ? 'Tap a shape to fill it with the selected color.'
        : 'Drag your finger to draw an outline (shown in blue), for example around the hair. Fills stop at it. Switch back to Fill when done.'
    view.style.touchAction = st.tool === 'outline' ? 'none' : 'pan-y'
    view.style.cursor = st.tool === 'outline' ? 'crosshair' : 'pointer'
    paintBtn.disabled = fills.size === 0
    undoBtn.disabled = st.history.length === 0
    clearBtn.disabled = st.fills.length === 0 && st.strokes.length === 0
  }

  const toImage = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = view.getBoundingClientRect()
    return [((e.clientX - rect.left) / rect.width) * m.width, ((e.clientY - rect.top) / rect.height) * m.height]
  }

  // Fill: a tap (click) fills the shape under it.
  view.addEventListener('click', (e) => {
    if (st.tool !== 'fill') return
    const [x, y] = toImage(e)
    if (shapeAt(m, x, y) < 0) return
    const c = currentChoice(s, st)
    st.choices.set(c.key, c)
    st.fills.push({ x, y, key: c.key })
    st.history.push('fill')
    fills = resolveFills(m, st.fills)
    redraw()
  })

  // Draw outline: drag to draw; the stroke becomes a wall when the finger lifts.
  let drawing: number[] | null = null
  view.addEventListener('pointerdown', (e) => {
    if (st.tool !== 'outline') return
    e.preventDefault()
    try {
      view.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic events */
    }
    drawing = toImage(e)
  })
  view.addEventListener('pointermove', (e) => {
    if (!drawing) return
    const [x, y] = toImage(e)
    const [px, py] = [drawing[drawing.length - 2], drawing[drawing.length - 1]]
    if (Math.hypot(x - px, y - py) < 1.5) return
    drawing.push(x, y)
    ctx.strokeStyle = `rgb(${USER_RGB.join(',')})`
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(x, y)
    ctx.stroke()
  })
  const endStroke = () => {
    if (!drawing) return
    if (drawing.length >= 4) {
      st.strokes.push(drawing)
      st.history.push('stroke')
      rebuild()
    }
    drawing = null
    redraw()
  }
  view.addEventListener('pointerup', endStroke)
  view.addEventListener('pointercancel', endStroke)

  undoBtn.addEventListener('click', () => {
    const last = st.history.pop()
    if (last === 'fill') st.fills.pop()
    if (last === 'stroke') {
      st.strokes.pop()
      rebuild()
    }
    fills = resolveFills(m, st.fills)
    redraw()
  })
  clearBtn.addEventListener('click', () => {
    st.fills = []
    st.strokes = []
    st.history = []
    rebuild()
    redraw()
  })
  paintBtn.addEventListener('click', async () => {
    paintBtn.disabled = true
    status.textContent = 'Planning the painting order… (about 10 seconds with Gemma on the laptop)'
    try {
      applyColoring(s)
      await onPlan()
    } finally {
      paintBtn.disabled = fills.size === 0
      status.textContent = ''
    }
  })

  const toolRow = radioRow<'fill' | 'outline'>(
    'Tool',
    [
      ['fill', 'Fill'],
      ['outline', 'Draw outline'],
    ],
    () => st.tool,
    (v) => {
      st.tool = v
      redraw()
    },
  )

  // Paint picker: your paints as chips, plus how much white to add. Picking a paint switches back to Fill.
  const { white } = classifyPalette(s.palette)
  const picker = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Paint' })
  for (const p of s.palette) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(p.id === st.paintId), class: 'paint-pick' }, chip(p.hex, p.name), ' ', p.name)
    b.addEventListener('click', () => {
      st.paintId = p.id
      st.tool = 'fill'
      toolRow.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-checked', String(i === 0)))
      picker.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)))
      redraw()
    })
    picker.append(b)
  }
  const lightenRow = radioRow('Add white', LIGHTEN, () => st.lighten, (v) => {
    st.lighten = v
    redraw()
  })
  // Fills are stored by tap position, so changing the gap setting keeps them.
  const gapRow = radioRow('Close gaps in the outline', GAPS, () => st.gap, (v) => {
    st.gap = v
    rebuild()
    redraw()
  })
  redraw()

  return h(
    'div',
    {},
    h('h2', {}, 'Color it in'),
    h('p', {}, 'Pick one of your paints, then tap shapes on the drawing to fill them. Where the drawing is open, like loose curls of hair, draw your own outline first so the color stays inside. When it looks right, Fieldmix plans the painting with exactly these colors.'),
    picker,
    white >= 0 ? h('div', {}, h('p', { class: 'muted' }, 'Add white:'), lightenRow) : '',
    h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Selected color'), current),
    toolRow,
    toolHint,
    h('div', { class: 'stage' }, view),
    h('div', { class: 'row', style: 'margin-top:8px' }, undoBtn, clearBtn),
    h('p', { class: 'muted' }, 'Color still spilling through a small break in a line? Close more gaps:'),
    gapRow,
    h('h2', {}, 'Your colors'),
    used,
    h('p', { class: 'muted' }, 'Recipes are starting points: test a small dab first. Sketch your blue outlines lightly on the canvas in pencil before painting.'),
    status,
    paintBtn,
  )
}
