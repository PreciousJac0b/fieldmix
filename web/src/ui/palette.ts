/**
 * Palette screen.
 * Quick path: tick the paints you have from the preset list.
 * Accurate path: photograph a swatch card, tap bare paper (white balance), tap each dab and name it.
 * Either way the palette can be saved in IndexedDB and reused.
 */

import { rgb8ToHex } from '../color/lab.ts'
import { PRESET_PAINTS, STUDENT_SET, TITANIUM_WHITE, type Paint } from '../color/paints.ts'
import { applyWhiteBalance, sampleMedian, whiteBalanceGains } from '../color/swatches.ts'
import type { Session } from '../session.ts'
import { deletePalette, listPalettes, savePalette } from '../store.ts'
import { loadPhoto } from './capture.ts'
import { chip, h } from './dom.ts'

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

export function renderPalette(s: Session, onNext: () => void, onBack: () => void): HTMLElement {
  if (s.palette.length === 0) s.palette = lastPalette() ?? [...STUDENT_SET, TITANIUM_WHITE]
  const body = h('div')
  const next = h('button', { type: 'button', class: 'primary big full' }, 'Next: color map')
  const countNote = h('p', { class: 'muted' })
  const refresh = () => {
    next.disabled = s.palette.length === 0
    countNote.textContent = `${s.palette.length} paint${s.palette.length === 1 ? '' : 's'} selected.`
  }
  next.addEventListener('click', () => {
    rememberLast(s.palette)
    onNext()
  })

  const tabs = h('div', { class: 'choices' })
  const quickTab = h('button', { type: 'button', 'aria-pressed': 'true' }, 'Tick my paints')
  const scanTab = h('button', { type: 'button', 'aria-pressed': 'false' }, 'Scan swatch card')
  tabs.append(quickTab, scanTab)
  const show = (which: 'quick' | 'scan') => {
    quickTab.setAttribute('aria-pressed', String(which === 'quick'))
    scanTab.setAttribute('aria-pressed', String(which === 'scan'))
    body.replaceChildren(which === 'quick' ? quickPanel(s, refresh) : scanPanel(s, refresh))
  }
  quickTab.addEventListener('click', () => show('quick'))
  scanTab.addEventListener('click', () => show('scan'))
  show('quick')
  refresh()

  return h(
    'div',
    {},
    h('h1', {}, 'Your paints'),
    h('p', { class: 'muted' }, 'Fieldmix only mixes from paints you actually have. Preset colors are typical student-grade paint, so scan a swatch card for more accurate mixes.'),
    savedPalettesRow(s, () => show('quick')),
    tabs,
    body,
    countNote,
    h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { type: 'button', onclick: onBack }, 'Back'), h('span', { class: 'spacer' }), saveButton(s)),
    next,
  )
}

function quickPanel(s: Session, refresh: () => void): HTMLElement {
  const list = h('div')
  for (const paint of PRESET_PAINTS) {
    const box = h('input', { type: 'checkbox', checked: s.palette.some((p) => p.id === paint.id) })
    box.addEventListener('change', () => {
      s.palette = box.checked ? [...s.palette.filter((p) => p.id !== paint.id), paint] : s.palette.filter((p) => p.id !== paint.id)
      refresh()
    })
    list.append(h('label', { class: 'check' }, box, chip(paint.hex), paint.name))
  }
  const custom = s.palette.filter((p) => !PRESET_PAINTS.some((q) => q.id === p.id))
  if (custom.length) {
    list.prepend(h('p', { class: 'muted' }, `Also in this palette from a scan: ${custom.map((p) => p.name).join(', ')}.`))
  }
  return list
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
  const b = h('button', { type: 'button' }, 'Save palette')
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
    h('button', { type: 'button', class: 'primary big full', onclick: () => input.click() }, 'Photograph swatch card'),
    stage,
    list,
    h('p', { class: 'muted' }, 'Scanned paints are added to any ticked presets. Untick presets you did not scan.'),
  )
}
