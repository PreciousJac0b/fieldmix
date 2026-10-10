/** Browser image helpers: decode a photo file and downscale it on a canvas. */

/** Decode an image file and draw it onto a canvas no larger than `longEdge` px on its long side. */
export async function fileToCanvas(file: Blob, longEdge: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

/** Pixel data of a canvas. */
export function canvasPixels(canvas: HTMLCanvasElement): ImageData {
  return canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height)
}

/** JPEG of a canvas as bare base64 (no data: prefix), for /api/plan. */
export function canvasToJpegBase64(canvas: HTMLCanvasElement, quality = 0.8): string {
  return canvas.toDataURL('image/jpeg', quality).split(',', 2)[1]
}
