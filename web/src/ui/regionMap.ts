/**
 * Region map: numbered overlay plus one card per region (target chip, mixed chip,
 * parts as dots, quality label, "starting point" note, tips). Long-press the image
 * for an eyedropper recipe of that exact spot.
 */

import { adjustmentTips, eyedropper } from '../color/adjust.ts'
import type { Recipe } from '../color/recipes.ts'
import { drawOverlay, extractRegions, isLineArt } from '../color/regions.ts'
import { solveInWorker } from '../color/solver.ts'
import { quality, recipeDots, recipeText, regionLabel, type Session } from '../session.ts'
import { renderCompare } from './compare.ts'
import { chip, h } from './dom.ts'

const LONG_PRESS_MS = 500

/** Compute regions and recipes for the session photo (recipes in the Web Worker). */
export async function computeRegions(s: Session): Promise<void> {
  if (!s.photo) throw new Error('no photo')
  s.regions = extractRegions(s.photo.pixels, { k: s.setup.k, seed: 1 })
  const { results } = await solveInWorker(
    s.palette,
    s.regions.regions.map((r) => ({ id: r.id, lab: r.lab })),
  )
  s.recipes = results
  s.working = new Map(results.map((r) => [Number(r.target_id), r.options[0]?.parts ?? []]))
  s.plan = null
}

function recipeBlock(s: Session, recipe: Recipe): HTMLElement {
  const q = quality(recipe.delta_e)
  return h(
    'div',
    {},
    ...recipeDots(s.palette, recipe.parts).map((d) => h('div', { class: 'dotrow' }, chip(d.hex, d.name), h('span', { class: 'dots', 'aria-hidden': 'true' }, d.dots), h('span', {}, d.name))),
    h('p', { class: 'muted' }, recipeText(s.palette, recipe.parts)),
    h('div', { class: 'row' }, h('span', { class: `badge ${q.cls}` }, q.label), h('span', { class: 'muted' }, `ΔE ${recipe.delta_e.toFixed(1)}`), h('span', { class: 'starting' }, 'Starting point: test dab first')),
  )
}

function regionCard(s: Session, id: number): HTMLElement {
  const region = s.regions!.regions.find((r) => r.id === id)!
  const res = s.recipes.find((r) => Number(r.target_id) === id)!
  const [best, second] = res.options
  const tips = best && best.delta_e >= 5 ? adjustmentTips(region.lab, best.result_lab, s.palette) : []
  const other = second
    ? h('details', {}, h('summary', {}, "Don't have one of these? Another option"), h('div', { class: 'row' }, chip(second.result_hex, 'other mix')), recipeBlock(s, second))
    : null
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'row' }, h('span', { class: 'num' }, String(id)), h('strong', {}, regionLabel(s.plan, id)), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `${region.area_pct}% of picture`)),
    h('div', { class: 'row', style: 'margin:8px 0' }, chip(region.hex, 'target'), h('span', {}, '→'), chip(best.result_hex, 'your mix'), h('span', { class: 'muted' }, 'target → your mix')),
    recipeBlock(s, best),
    ...tips.map((t) => h('p', {}, '💡 ', t.message)),
    other,
  )
}

function eyedropSheet(s: Session, x: number, y: number, close: () => void): HTMLElement {
  const res = eyedropper(s.photo!.pixels, x, y, s.palette)
  return h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-label': 'Eyedropper recipe' },
    h('div', { class: 'row' }, h('strong', {}, 'This exact spot'), chip(res.target_hex), h('span', { class: 'spacer' }), h('button', { type: 'button', onclick: close }, 'Close')),
    ...res.options.map((o, i) => h('div', { class: 'card' }, h('div', { class: 'row' }, h('strong', {}, i === 0 ? 'Best mix' : 'Other option'), chip(o.result_hex)), recipeBlock(s, o))),
  )
}

/** Attach long-press → eyedropper on the overlay canvas. */
function attachLongPress(s: Session, canvas: HTMLCanvasElement, host: HTMLElement): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let start: { x: number; y: number } | null = null
  let sheet: HTMLElement | null = null
  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  canvas.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY }
    cancel()
    timer = setTimeout(() => {
      const rect = canvas.getBoundingClientRect()
      const px = ((start!.x - rect.left) / rect.width) * s.photo!.pixels.width
      const py = ((start!.y - rect.top) / rect.height) * s.photo!.pixels.height
      navigator.vibrate?.(30)
      sheet?.remove()
      sheet = eyedropSheet(s, px, py, () => sheet?.remove())
      host.append(sheet)
    }, LONG_PRESS_MS)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel()
  })
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(ev, cancel)
}

export function renderRegionMap(s: Session, onPlan: () => Promise<void>, onBack: () => void, onRetake: () => void = onBack): HTMLElement {
  const root = h('div')
  const photo = s.photo!
  const regions = s.regions!
  const base = document.createElement('canvas')
  base.width = photo.canvas.width
  base.height = photo.canvas.height
  base.getContext('2d')!.drawImage(photo.canvas, 0, 0)
  const overlay = h('canvas', { class: 'overlay', width: base.width, height: base.height, 'aria-label': 'Numbered color regions. Long-press for the color of one spot.' })
  drawOverlay(overlay.getContext('2d')!, regions)
  attachLongPress(s, overlay, root)

  const planBtn = h('button', { type: 'button', class: 'primary big full' }, 'Make my painting plan')
  const status = h('p', { class: 'muted' })
  planBtn.addEventListener('click', async () => {
    planBtn.disabled = true
    status.textContent = 'Planning the painting order… (about 10 seconds with Gemma on the laptop)'
    try {
      await onPlan()
    } finally {
      planBtn.disabled = false
      status.textContent = ''
    }
  })

  const closest = s.recipes.filter((r) => r.closest_possible).length
  const lineArt = isLineArt(regions.regions)

  const mapPanel = h(
    'div',
    { role: 'tabpanel', id: 'panel-map' },
    h('p', { class: 'muted' }, 'Each number is one color to mix. Long-press anywhere on the picture to get a mix for that exact spot.'),
    h('div', { class: 'stage' }, base, overlay),
    closest ? h('p', {}, `${closest} region${closest > 1 ? 's are' : ' is'} hard to match with these paints, so ${closest > 1 ? 'they are' : 'it is'} marked "Closest possible".`) : '',
    h('p', { class: 'muted' }, 'Mixes are starting points: real paint, brands, and the light in your photo all shift the result. Always test a small dab first.'),
    ...regions.regions.map((r) => regionCard(s, r.id)),
  )
  // Built when first opened (and rebuilt each time, so it reflects test-dab changes).
  const comparePanel = h('div', { role: 'tabpanel', id: 'panel-compare', class: 'hidden' })

  const tabs = h('div', { class: 'choices', role: 'tablist' })
  const mapTab = h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', 'aria-controls': 'panel-map' }, 'Color map')
  const compareTab = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', 'aria-controls': 'panel-compare' }, 'Before / after')
  const select = (which: 'map' | 'compare') => {
    mapTab.setAttribute('aria-selected', String(which === 'map'))
    compareTab.setAttribute('aria-selected', String(which === 'compare'))
    mapPanel.classList.toggle('hidden', which !== 'map')
    comparePanel.classList.toggle('hidden', which !== 'compare')
    if (which === 'compare') comparePanel.replaceChildren(renderCompare(s))
  }
  mapTab.addEventListener('click', () => select('map'))
  compareTab.addEventListener('click', () => select('compare'))
  tabs.append(mapTab, compareTab)

  root.append(
    h('h1', {}, 'Your color map'),
    lineArt
      ? h(
          'div',
          { class: 'card', role: 'note' },
          h('strong', {}, 'This picture is almost all black, white and grey.'),
          h('p', {}, 'It looks like an outline drawing or a blank canvas, so there are no colors to mix yet. At a paint-and-sip event, photograph the host\'s finished sample painting instead.'),
          h('button', { type: 'button', onclick: onRetake }, 'Take a different photo'),
        )
      : '',
    tabs,
    mapPanel,
    comparePanel,
    h('div', { class: 'row' }, h('button', { type: 'button', onclick: onBack }, 'Back')),
    status,
    planBtn,
  )
  return root
}
