/**
 * Before / after: the uploaded photo next to a preview of the finished painting, made
 * from the painter's own mixes (current recipes, including test-dab adjustments).
 * A wipe slider compares them on a phone; drag on the picture or use the slider.
 */

import { deltaE2000 } from '../color/lab.ts'
import { mixPaints } from '../color/mix.ts'
import { areaWeightedDeltaE, hexToRgb8, modeFilter, paintPreview } from '../color/preview.ts'
import { isLineArt } from '../color/regions.ts'
import { renderColorIn } from './colorIn.ts'
import { quality, type Session } from '../session.ts'
import { h } from './dom.ts'

/** Build the "after" image as a canvas the size of the region map. */
export function previewCanvas(s: Session): { canvas: HTMLCanvasElement; overallDeltaE: number } {
  const { labelMap, width, height, regions } = s.regions!
  const mixes = regions.map((r) => {
    const parts = s.working.get(r.id) ?? []
    if (!parts.length) return { hex: r.hex, lab: r.lab }
    return mixPaints(parts.map((p) => ({ hex: s.palette.find((q) => q.id === p.paint_id)?.hex ?? r.hex, parts: p.parts })))
  })
  const smooth = modeFilter(labelMap, width, height, 2)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const pixels = paintPreview(smooth, mixes.map((m) => hexToRgb8(m.hex)))
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0)
  const overallDeltaE = areaWeightedDeltaE(regions.map((r, i) => ({ area_pct: r.area_pct, delta_e: deltaE2000(r.lab, mixes[i].lab) })))
  return { canvas, overallDeltaE }
}

function caption(ctx: CanvasRenderingContext2D, text: string, x: number, align: CanvasTextAlign, fontPx: number): void {
  ctx.font = `bold ${fontPx}px system-ui, sans-serif`
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.lineWidth = Math.max(3, fontPx / 4)
  ctx.strokeStyle = '#000'
  ctx.fillStyle = '#fff'
  ctx.strokeText(text, x, fontPx * 0.5)
  ctx.fillText(text, x, fontPx * 0.5)
}

export function renderCompare(s: Session, onPlan: () => Promise<void>): HTMLElement {
  // Outline drawings have no colors to preview, so offer coloring them in instead.
  if (s.coloring || isLineArt(s.regions!.regions)) {
    return h(
      'div',
      {},
      s.coloring?.fills.size
        ? ''
        : h(
            'div',
            { class: 'card', role: 'note' },
            h('strong', {}, 'This is an outline drawing, so there are no colors to preview yet.'),
            h('p', {}, 'Color it in below with your own paints, or photograph the host\'s finished sample painting instead.'),
          ),
      renderColorIn(s, onPlan),
    )
  }
  const photo = s.photo!.canvas
  const { canvas: after, overallDeltaE } = previewCanvas(s)
  const view = h('canvas', { width: photo.width, height: photo.height, 'aria-label': 'Photo on the left, preview of your painting on the right' })
  view.style.touchAction = 'none'
  const ctx = view.getContext('2d')!
  const fontPx = Math.max(14, Math.round(Math.min(photo.width, photo.height) * 0.05))
  const slider = h('input', { type: 'range', min: '0', max: '100', step: '1', value: '50', 'aria-label': 'Compare: drag left for more painting, right for more photo' })

  const draw = () => {
    const split = Math.round((Number(slider.value) / 100) * view.width)
    ctx.clearRect(0, 0, view.width, view.height)
    ctx.drawImage(after, 0, 0)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, split, view.height)
    ctx.clip()
    ctx.drawImage(photo, 0, 0)
    ctx.restore()
    ctx.fillStyle = '#fff'
    ctx.fillRect(split - 2, 0, 4, view.height)
    ctx.fillStyle = '#000'
    ctx.fillRect(split - 1, 0, 2, view.height)
    if (split > view.width * 0.2) caption(ctx, 'Photo', 8, 'left', fontPx)
    if (split < view.width * 0.8) caption(ctx, 'Painting', view.width - 8, 'right', fontPx)
  }
  slider.addEventListener('input', draw)

  // Drag directly on the picture to move the divider.
  const moveTo = (clientX: number) => {
    const rect = view.getBoundingClientRect()
    slider.value = String(Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * 100))
    draw()
  }
  let dragging = false
  view.addEventListener('pointerdown', (e) => {
    dragging = true
    try {
      view.setPointerCapture(e.pointerId) // keep the drag even if the finger leaves the picture
    } catch {
      /* not an active pointer (e.g. synthetic events) */
    }
    moveTo(e.clientX)
  })
  view.addEventListener('pointermove', (e) => {
    if (dragging) moveTo(e.clientX)
  })
  for (const ev of ['pointerup', 'pointercancel']) view.addEventListener(ev, () => (dragging = false))
  draw()

  const set = (v: number) => () => {
    slider.value = String(v)
    draw()
  }
  const q = quality(overallDeltaE)
  const used = [...new Set([...s.working.values()].flat().map((p) => p.paint_id))]
  const names = used.map((id) => s.palette.find((p) => p.id === id)?.name ?? id)

  return h(
    'div',
    {},
    h('p', { class: 'muted' }, 'Left: your photo. Right: what the finished painting could look like if you follow the plan with these paints. Drag across the picture to compare.'),
    h('div', { class: 'stage' }, view),
    slider,
    h(
      'div',
      { class: 'seg' },
      h('button', { type: 'button', onclick: set(100) }, 'Photo'),
      h('button', { type: 'button', onclick: set(50) }, 'Both'),
      h('button', { type: 'button', onclick: set(0) }, 'Painting'),
    ),
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'row' }, h('strong', {}, 'Overall color match'), h('span', { class: `badge ${q.cls}` }, q.label), h('span', { class: 'muted' }, `average ΔE ${overallDeltaE.toFixed(1)}, weighted by area`)),
      h('p', {}, `${s.regions!.regions.length} mixes from ${used.length} of your paints: ${names.join(', ')}.`),
      h('p', { class: 'muted' }, 'This preview is flat shapes in your mixed colors. Brushwork, layering, real pigments and the light where you paint will all change the result: it shows where the plan is heading, not a guarantee.'),
    ),
  )
}
