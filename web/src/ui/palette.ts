/**
 * Paints page. A palette board fills with a blob of each paint the painter picks.
 * Quick path: tap the paint tubes you have (or a quick set).
 * Accurate path: photograph a swatch card, tap bare paper (white balance), tap each dab and name it.
 * Either way the palette can be saved in IndexedDB and reused.
 */

import { rgb8ToHex } from '../color/lab.ts'
import { EVAL_PALETTES, EXTRA_PAINTS, MARS_BLACK, PRESET_PAINTS, STUDENT_SET, TITANIUM_WHITE, type Paint } from '../color/paints.ts'
import { applyWhiteBalance, sampleMedian, whiteBalanceGains } from '../color/swatches.ts'
import type { Session } from '../session.ts'
import { deletePalette, listPalettes, savePalette } from '../store.ts'
import { canOpenCamera, loadPhoto } from './capture.ts'
import { chip, h } from './dom.ts'
import { icon, paletteBoard, tube } from './icons.ts'
import { actionBar, page, pageTitle } from './layout.ts'

const LAST_KEY = 'fieldmix.lastPalette'

function rememberLast(paints: Paint[]): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(paints))
  } catch {
    /* storage blocked */
  }
}

function lastPalette(): Paint[] | null {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    return raw ? (JSON.parse(raw) as Paint[]) : null
  } catch {
    return null
  }
}

export function renderPalette(s: Session, onNext: () => void, onBack: () => void, onRetake: () => void): HTMLElement {
  if (s.palette.length === 0) s.palette = lastPalette() ?? [...STUDENT_SET, TITANIUM_WHITE]
  const board = paletteBoard()
  const body = h('div')
  const count = h('span', { class: 'count', role: 'status' })
  const next = h('button', { type: 'button', class: 'primary big grow' }, 'Next: your colors', icon('arrowRight', 26))
  const boardNote = h('p', { class: 'board-note muted' })
  const refresh = () => {
    const n = s.palette.length
    board.update(s.palette.map((p) => p.hex))
    next.disabled = n === 0
    count.replaceChildren(h('strong', {}, String(n)), ` paint${n === 1 ? '' : 's'}`)
    boardNote.textContent = n ? '' : 'Tap the paints you have to put them on your palette.'
  }
  next.addEventListener('click', () => {
    rememberLast(s.palette)
    onNext()
  })

  const quickTab = h('button', { type: 'button', role: 'tab', 'aria-selected': 'true' }, icon('palette'), 'Tick my paints')
  const scanTab = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false' }, icon('scan'), 'Scan a swatch card')
  const show = (which: 'quick' | 'scan') => {
    quickTab.setAttribute('aria-selected', String(which === 'quick'))
    scanTab.setAttribute('aria-selected', String(which === 'scan'))
    body.replaceChildren(which === 'quick' ? quickPanel(s, refresh, () => show('quick')) : scanPanel(s, refresh))
  }
  quickTab.addEventListener('click', () => show('quick'))
  scanTab.addEventListener('click', () => show('scan'))
  show('quick')
  refresh()

  return page(
    'paints',
    onBack,
    pageTitle('palette', 'Which paints do you have?', 'var(--tint-red)'),
    photoStrip(s, onRetake),
    h('p', { class: 'lead' }, 'Fieldmix only mixes from the paints on your palette, so every recipe is one you can actually make.'),
    h('div', { class: 'board-wrap' }, board.el, boardNote),
    h('div', { class: 'choices tabs', role: 'tablist' }, quickTab, scanTab),
    body,
    h('div', { class: 'saved' }, savedPalettesRow(s, () => {
      show('quick')
      refresh()
    }), saveButton(s)),
    actionBar(count, next),
  )
}

/** The photo being mixed for, with a way to retake it. */
function photoStrip(s: Session, onRetake: () => void): HTMLElement | null {
  if (!s.photo) return null
  const c = document.createElement('canvas')
  c.width = s.photo.canvas.width
  c.height = s.photo.canvas.height
  c.getContext('2d')!.drawImage(s.photo.canvas, 0, 0)
  return h(
    'div',
    { class: 'photo-strip' },
    c,
    h('span', {}, h('strong', {}, 'Mixing for this photo'), h('span', { class: 'muted' }, s.setup.mode === 'scene' ? 'Scene outdoors' : 'Reference painting')),
    h('button', { type: 'button', 'aria-label': 'Retake photo', onclick: onRetake }, icon('retake', 20), h('span', { class: 'wide-only' }, 'Retake')),
  )
}

/** One-tap paint sets, then every preset as a tube to tap on or off. */
function quickPanel(s: Session, refresh: () => void, rerender: () => void): HTMLElement {
  const setChip = (label: string, paints: Paint[]) =>
    h('button', {
      type: 'button',
      onclick: () => {
        s.palette = [...paints]
        rerender()
        refresh()
      },
    }, label)
  const tubeTile = (paint: Paint) => {
    const on = () => s.palette.some((p) => p.id === paint.id)
    const b = h(
      'button',
      { type: 'button', class: 'tube-tile', 'aria-pressed': String(on()) },
      tube(paint.hex),
      h('span', {}, paint.name),
      h('span', { class: 'tick', 'aria-hidden': 'true' }, icon('check', 16)),
    )
    b.addEventListener('click', () => {
      s.palette = on() ? s.palette.filter((p) => p.id !== paint.id) : [...s.palette, paint]
      b.setAttribute('aria-pressed', String(on()))
      refresh()
    })
    return b
  }
  const custom = s.palette.filter((p) => !PRESET_PAINTS.some((q) => q.id === p.id))
  return h(
    'div',
    {},
    h('p', { class: 'muted' }, 'Quick sets:'),
    h(
      'div',
      { class: 'chips' },
      setChip('Starter set', [...STUDENT_SET, TITANIUM_WHITE]),
      setChip('Primaries + white & black', EVAL_PALETTES.primaries_wb),
      setChip('Everything', PRESET_PAINTS),
      setChip('Clear', []),
    ),
    custom.length ? h('p', { class: 'muted' }, `Also on your palette from a scan: ${custom.map((p) => p.name).join(', ')}.`) : null,
    h('h2', {}, 'Starter set'),
    h('div', { class: 'tube-grid' }, ...[...STUDENT_SET, TITANIUM_WHITE, MARS_BLACK].map(tubeTile)),
    h('h2', {}, 'More colors'),
    h('div', { class: 'tube-grid' }, ...EXTRA_PAINTS.map(tubeTile)),
    h('p', { class: 'muted' }, 'Tube colors are typical student-grade paint. Your brand may differ: scan a swatch card for more accurate mixes.'),
  )
}

function savedPalettesRow(s: Session, rerender: () => void): HTMLElement {
  const row = h('div', { class: 'row' })
  void listPalettes().then((saved) => {
    if (!saved.length) return
    const select = h('select', { 'aria-label': 'Saved palettes' }, h('option', { value: '' }, 'Load a saved palette…'), ...saved.map((p) => h('option', { value: p.name }, `${p.name} (${p.paints.length})`)))
    select.addEventListener('change', () => {
      const pick = saved.find((p) => p.name === select.value)
      if (!pick) return
      s.palette = pick.paints
      rerender()
    })
    const del = h('button', { type: 'button' }, 'Delete')
    del.addEventListener('click', async () => {
      if (!select.value) return
      await deletePalette(select.value)
      select.selectedOptions[0].remove()
      select.value = ''
    })
    row.append(h('div', { style: 'flex:1' }, select), del)
  })
  return row
}

function saveButton(s: Session): HTMLElement {
  const b = h('button', { type: 'button' }, icon('save', 20), 'Save this palette')
  b.addEventListener('click', async () => {
    const name = prompt('Name this palette', 'My paints')?.trim()
    if (!name) return
    await savePalette(name, s.palette)
    b.textContent = 'Saved ✓'
  })
  return b
}

/** Common paint names for naming scanned dabs (free text is allowed too). */
const NAME_LIST = [...new Set([...PRESET_PAINTS.map((p) => p.name), 'Cadmium Orange', 'Naples Yellow', 'Prussian Blue', 'Cobalt Blue', 'Viridian', 'Ivory Black', 'Hooker\'s Green', 'Permanent Rose', 'Indian Yellow'])]

function scanPanel(s: Session, refresh: () => void): HTMLElement {
  const stage = h('div', { class: 'stage' })
  const status = h('p', {}, 'Paint a dab of each color on white paper, let it dry, and photograph the card in even light.')
  const list = h('div')
  let gains: [number, number, number] | null = null
  let pixels: ImageData | null = null
  const scanned: Paint[] = s.palette.filter((p) => p.id.startsWith('scan-'))

  const datalist = h('datalist', { id: 'paint-names' }, ...NAME_LIST.map((n) => h('option', { value: n })))
  const renderList = () => {
    list.replaceChildren(
      ...scanned.map((p, i) => {
        const name = h('input', { type: 'text', value: p.name, list: 'paint-names', 'aria-label': 'Paint name' })
        name.addEventListener('change', () => {
          p.name = name.value.trim() || p.name
          s.palette = [...s.palette.filter((q) => q.id !== p.id), p]
        })
        const del = h('button', { type: 'button' }, 'Remove')
        del.addEventListener('click', () => {
          scanned.splice(i, 1)
          s.palette = s.palette.filter((q) => q.id !== p.id)
          renderList()
          refresh()
        })
        return h('div', { class: 'row', style: 'margin:6px 0' }, chip(p.hex), h('div', { style: 'flex:1' }, name), del)
      }),
    )
  }

  const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' })
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    const photo = await loadPhoto(file)
    pixels = photo.pixels
    gains = null
    const canvas = document.createElement('canvas')
    canvas.width = photo.canvas.width
    canvas.height = photo.canvas.height
    canvas.getContext('2d')!.drawImage(photo.canvas, 0, 0)
    canvas.addEventListener('click', (ev) => {
      if (!pixels) return
      const rect = canvas.getBoundingClientRect()
      const x = ((ev.clientX - rect.left) / rect.width) * pixels.width
      const y = ((ev.clientY - rect.top) / rect.height) * pixels.height
      const rgb = sampleMedian(pixels, x, y, 15)
      if (!gains) {
        gains = whiteBalanceGains(rgb)
        status.textContent = 'White balance set. Now tap the middle of each paint dab.'
        return
      }
      const [r, g, b] = applyWhiteBalance(rgb, gains)
      const hex = rgb8ToHex(r, g, b)
      const paint: Paint = { id: `scan-${Date.now()}-${scanned.length}`, name: `Paint ${scanned.length + 1}`, hex }
      scanned.push(paint)
      s.palette = [...s.palette, paint]
      renderList()
      refresh()
      status.textContent = 'Added. Name it below, then tap the next dab.'
    })
    stage.replaceChildren(canvas)
    status.textContent = 'First tap bare white paper (sets white balance), then tap each dab.'
  })
  renderList()

  return h(
    'div',
    {},
    datalist,
    input,
    status,
    h('button', { type: 'button', class: 'primary big full', onclick: () => input.click() }, icon('camera', 26), canOpenCamera() ? 'Photograph swatch card' : 'Choose swatch card photo'),
    stage,
    list,
    h('p', { class: 'muted' }, 'Scanned paints are added to any ticked presets. Untick presets you did not scan.'),
  )
}
