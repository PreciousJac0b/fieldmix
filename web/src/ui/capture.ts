/** Photo loading. The camera opens through a file input (works without HTTPS; no getUserMedia), see setup.ts. */

import type { Photo } from '../session.ts'
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
