/** Session page: time available, kind of paint, number of colors, then the photo. */

import type { Medium } from '../api.ts'
import type { Session } from '../session.ts'
import { canOpenCamera, loadPhoto } from './capture.ts'
import { h } from './dom.ts'
import { icon, mediumArt, timeArt } from './icons.ts'
import { actionBar, page, pageTitle } from './layout.ts'

/** A group of big picture tiles; exactly one is pressed. */
function tiles<T>(cls: string, label: string, options: { value: T; art: SVGSVGElement; name: string; note: string }[], current: T, onPick: (v: T) => void): HTMLElement {
  const group = h('div', { class: `tiles ${cls}`, role: 'group', 'aria-label': label })
  for (const o of options) {
    const b = h(
      'button',
      { type: 'button', class: 'tile', 'aria-pressed': String(o.value === current) },
      o.art,
      h('span', { class: 'tile-name' }, o.name),
      h('small', {}, o.note),
      h('span', { class: 'tick', 'aria-hidden': 'true' }, icon('check', 16)),
    )
    b.addEventListener('click', () => {
      group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
      onPick(o.value)
    })
    group.append(b)
  }
  return group
}

const MEDIUMS: { value: Medium; name: string; note: string }[] = [
  { value: 'acrylic', name: 'Acrylic', note: 'Dries fast, layers well' },
  { value: 'watercolor', name: 'Watercolor', note: 'Light to dark, save the whites' },
  { value: 'oil', name: 'Oil', note: 'Slow drying, blends wet' },
  { value: 'gouache', name: 'Gouache', note: 'Matte and opaque' },
]

/** Sample colors for the "how many colors" preview (earthy to bright, like a typical scene). */
const PREVIEW = ['#7fb3e6', '#4f6b2a', '#f9d71c', '#8a3b22', '#d93a2b', '#e9e4d4', '#243b8f', '#86a85a', '#c79a2e', '#3b1e5a']

function thumbnail(source: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = source.width
  c.height = source.height
  c.getContext('2d')!.drawImage(source, 0, 0)
  return c
}

export function renderSetup(s: Session, onPhoto: () => void, onBack: () => void): HTMLElement {
  // How many colors: slider plus a row of swatches that grows and shrinks with it.
  const kValue = h('strong', {}, String(s.setup.k))
  const swatches = h('div', { class: 'swatches', 'aria-hidden': 'true' })
  const drawSwatches = () => swatches.replaceChildren(...PREVIEW.slice(0, s.setup.k).map((c) => h('span', { style: `background:${c}` })))
  const slider = h('input', { type: 'range', min: '4', max: '10', step: '1', value: String(s.setup.k), 'aria-label': 'Number of colors' })
  slider.addEventListener('input', () => {
    s.setup.k = Number(slider.value)
    kValue.textContent = slider.value
    s.regions = null
    drawSwatches()
  })
  drawSwatches()

  // Photo: the phone's camera through a file input (works without HTTPS), or the gallery.
  const status = h('p', { class: 'muted', role: 'status' })
  const onFile = async (file: File | undefined) => {
    if (!file) return
    status.textContent = 'Reading photo…'
    try {
      s.photo = await loadPhoto(file)
      s.regions = null // force a fresh color map
      s.coloring = null
      s.planImage = null
      s.plan = null
      status.textContent = ''
      onPhoto()
    } catch (err) {
      status.textContent = `Couldn't read that photo: ${String(err)}`
    }
  }
  const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' })
  camera.addEventListener('change', () => onFile(camera.files?.[0]))
  const gallery = h('input', { type: 'file', accept: 'image/*', class: 'hidden' })
  gallery.addEventListener('change', () => onFile(gallery.files?.[0]))
  const phone = canOpenCamera()

  const scene = s.setup.mode === 'scene'
  const hint = scene
    ? 'Stand where you will paint and photograph the view, framed the way you want to paint it.'
    : "Photograph the host's finished sample painting: that's where the colors are. Only have the outline canvas? Photograph it and color it in with your paints."

  return page(
    'setup',
    onBack,
    pageTitle('clock', 'Set up your session', 'var(--tint-blue)'),
    h('p', { class: 'lead' }, 'Two quick choices, then a photo.'),
    h('h2', {}, 'How long do you have?'),
    tiles<30 | 60 | 90>(
      'three',
      'Time you have',
      [
        { value: 30, art: timeArt(30), name: '30 min', note: 'A quick sketch' },
        { value: 60, art: timeArt(60), name: '1 hour', note: 'A full study' },
        { value: 90, art: timeArt(90), name: '1½ hours', note: 'Time for detail' },
      ],
      s.setup.minutes,
      (v) => (s.setup.minutes = v),
    ),
    h('h2', {}, 'What paint are you using?'),
    tiles<Medium>(
      'two',
      'Kind of paint',
      MEDIUMS.map((m) => ({ ...m, art: mediumArt(m.value) })),
      s.setup.medium,
      (v) => (s.setup.medium = v),
    ),
    h(
      'details',
      { class: 'more' },
      h('summary', {}, icon('settings', 20), 'More options'),
      h('p', {}, 'Number of colors: ', kValue),
      swatches,
      slider,
      h('p', { class: 'muted' }, 'Fewer colors means simpler shapes and fewer mixes. 6 suits most pictures.'),
    ),
    h(
      'div',
      { class: 'card photo-card' },
      h('div', { class: 'title' }, h('span', { class: 'badge-icon', style: '--tint:var(--tint-yellow)' }, icon('camera', 28)), h('h2', {}, scene ? 'Photograph the scene' : 'Photograph the reference')),
      h('p', {}, hint),
      s.photo
        ? h(
            'div',
            { class: 'current-photo' },
            thumbnail(s.photo.canvas),
            h('div', {}, h('strong', {}, 'Your photo'), h('button', { type: 'button', class: 'primary', onclick: onPhoto }, 'Use this photo', icon('arrowRight'))),
          )
        : null,
      phone ? null : h('p', { class: 'muted' }, 'On a laptop the browser opens a file picker. Open Fieldmix on your phone to use its camera.'),
      status,
    ),
    camera,
    gallery,
    actionBar(
      phone
        ? h('button', { type: 'button', class: 'primary big grow', onclick: () => camera.click() }, icon('camera', 28), s.photo ? 'New photo' : 'Take a photo')
        : h('button', { type: 'button', class: 'primary big grow', onclick: () => gallery.click() }, icon('image', 28), s.photo ? 'Choose another' : 'Choose a photo'),
      phone ? h('button', { type: 'button', class: 'big side', 'aria-label': 'Choose from gallery', onclick: () => gallery.click() }, icon('image', 28), 'Gallery') : null,
    ),
  )
}
