/** Photo capture: the phone's own camera via a file input (works without HTTPS; no getUserMedia). */

import type { Photo, Session } from '../session.ts'
import { h } from './dom.ts'
import { canvasPixels, canvasToJpegBase64, fileToCanvas } from './image.ts'

/** Decode a photo once at 768 px (sent to the model) and derive the 512 px copy (for regions). */
export async function loadPhoto(file: Blob): Promise<Photo> {
  const big = await fileToCanvas(file, 768)
  const scale = Math.min(1, 512 / Math.max(big.width, big.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(big.width * scale))
  canvas.height = Math.max(1, Math.round(big.height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(big, 0, 0, canvas.width, canvas.height)
  return { canvas, pixels: canvasPixels(canvas), jpeg768: canvasToJpegBase64(big, 0.8) }
}

/**
 * Whether the file input's `capture` attribute will open a camera. Phone and tablet
 * browsers honor it; desktop browsers ignore it and show a file picker. A touch-first
 * device (coarse primary pointer) is the practical signal.
 */
export function canOpenCamera(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
}

export function renderCapture(s: Session, onNext: () => void, onBack: () => void): HTMLElement {
  const preview = h('div', { class: 'stage' })
  const next = h('button', { type: 'button', class: 'primary big full', disabled: !s.photo, onclick: onNext }, 'Next: your paints')
  const status = h('p', { class: 'muted' })
  const showPreview = () => {
    preview.replaceChildren()
    if (s.photo) {
      const c = document.createElement('canvas')
      c.width = s.photo.canvas.width
      c.height = s.photo.canvas.height
      c.getContext('2d')!.drawImage(s.photo.canvas, 0, 0)
      preview.append(c)
    }
  }
  const onFile = async (file: File | undefined) => {
    if (!file) return
    status.textContent = 'Reading photo…'
    try {
      s.photo = await loadPhoto(file)
      s.regions = null // force a fresh region map
      status.textContent = ''
      next.disabled = false
      showPreview()
    } catch (err) {
      status.textContent = `Couldn't read that photo: ${String(err)}`
    }
  }
  const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' })
  input.addEventListener('change', () => onFile(input.files?.[0]))
  const fromLibrary = h('input', { type: 'file', accept: 'image/*', class: 'hidden' })
  fromLibrary.addEventListener('change', () => onFile(fromLibrary.files?.[0]))
  showPreview()

  const hint =
    s.setup.mode === 'scene'
      ? 'Stand where you will paint and photograph the view, framed the way you want to paint it.'
      : "Photograph the host's finished sample painting (not the blank or outlined canvas): that's where the colors are."

  return h(
    'div',
    {},
    h('h1', {}, s.setup.mode === 'scene' ? 'Photograph the scene' : 'Photograph the reference'),
    h('p', {}, hint),
    input,
    fromLibrary,
    canOpenCamera()
      ? h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary big', onclick: () => input.click() }, 'Take photo'), h('button', { type: 'button', class: 'big', onclick: () => fromLibrary.click() }, 'Choose from gallery'))
      : h(
          'div',
          {},
          h('button', { type: 'button', class: 'primary big', onclick: () => fromLibrary.click() }, 'Choose a photo'),
          h('p', { class: 'muted' }, 'On a laptop the browser opens a file picker. Open Fieldmix on your phone to take the photo with its camera.'),
        ),
    status,
    preview,
    h('div', { class: 'row', style: 'margin-top:16px' }, h('button', { type: 'button', onclick: onBack }, 'Back'), h('span', { class: 'spacer' })),
    next,
  )
}
