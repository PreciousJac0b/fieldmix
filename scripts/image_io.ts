/** Image I/O for the Node scripts (macOS: decodes with the built-in `sips` tool). */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PixelImage } from '../web/src/color/regions.ts'

/** Decode any image macOS can read into RGBA pixels, downscaled to `longEdge`. */
export function loadImage(path: string, longEdge = 512): PixelImage {
  const dir = mkdtempSync(join(tmpdir(), 'fieldmix-eval-'))
  const bmp = join(dir, 'img.bmp')
  execFileSync('sips', ['-s', 'format', 'bmp', '-Z', String(longEdge), path, '--out', bmp], { stdio: 'ignore' })
  return parseBmp(readFileSync(bmp))
}

/** Minimal BMP reader for the uncompressed 24/32-bit files sips writes. */
export function parseBmp(buf: Buffer): PixelImage {
  const offset = buf.readUInt32LE(10)
  const width = buf.readInt32LE(18)
  const rawHeight = buf.readInt32LE(22)
  const bpp = buf.readUInt16LE(28)
  const compression = buf.readUInt32LE(30)
  if ((bpp !== 24 && bpp !== 32) || (compression !== 0 && compression !== 3)) {
    throw new Error(`unsupported BMP: ${bpp} bpp, compression ${compression}`)
  }
  const height = Math.abs(rawHeight)
  const bottomUp = rawHeight > 0
  const bytes = bpp / 8
  const stride = Math.ceil((width * bytes) / 4) * 4
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const row = offset + (bottomUp ? height - 1 - y : y) * stride
    for (let x = 0; x < width; x++) {
      const s = row + x * bytes
      const d = (y * width + x) * 4
      data[d] = buf[s + 2]
      data[d + 1] = buf[s + 1]
      data[d + 2] = buf[s]
      data[d + 3] = 255
    }
  }
  return { width, height, data }
}

/** A JPEG of the photo, `longEdge` px on the long side, as bare base64 (what the browser sends to /api/plan). */
export function jpegBase64(path: string, longEdge = 768): string {
  const dir = mkdtempSync(join(tmpdir(), 'fieldmix-jpg-'))
  const out = join(dir, 'img.jpg')
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', String(longEdge), path, '--out', out], { stdio: 'ignore' })
  return readFileSync(out).toString('base64')
}
