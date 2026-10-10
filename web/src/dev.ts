/**
 * Debug page (dev.html): region map plus, per region, target chip, mixed chip,
 * recipe and ΔE. Click the image for an eyedropper recipe.
 */

import { eyedropper } from './color/adjust.ts'
import { EVAL_PALETTES, PRESET_PAINTS, type Paint } from './color/paints.ts'
import type { Recipe } from './color/recipes.ts'
import { drawOverlay, extractRegions, type RegionResult } from './color/regions.ts'
import { solveInWorker } from './color/solver.ts'
import { canvasPixels, fileToCanvas } from './ui/image.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const fileInput = $<HTMLInputElement>('file')
const paletteSelect = $<HTMLSelectElement>('palette')
const kInput = $<HTMLInputElement>('k')
const status = $<HTMLSpanElement>('status')
const photo = $<HTMLCanvasElement>('photo')
const overlay = $<HTMLCanvasElement>('overlay')
const table = $<HTMLTableElement>('regions')
const eyedrop = $<HTMLDivElement>('eyedrop')

const palettes: Record<string, Paint[]> = { ...EVAL_PALETTES, all_presets: PRESET_PAINTS }
for (const name of Object.keys(palettes)) paletteSelect.add(new Option(name, name))

let pixels: ImageData | null = null
let result: RegionResult | null = null

const nameOf = (palette: Paint[], id: string) => palette.find((p) => p.id === id)?.name ?? id
const recipeText = (palette: Paint[], r: Recipe) => r.parts.map((p) => `${p.parts} × ${nameOf(palette, p.paint_id)}`).join(' + ')
const chip = (hex: string) => `<span class="chip" style="background:${hex}" title="${hex}"></span>`

async function run(): Promise<void> {
  if (!pixels) return
  const palette = palettes[paletteSelect.value]
  const k = Number(kInput.value)
  const t0 = performance.now()
  result = extractRegions(pixels, { k, seed: 1 })
  const regionMs = performance.now() - t0

  overlay.width = photo.width
  overlay.height = photo.height
  const ctx = overlay.getContext('2d')!
  ctx.clearRect(0, 0, overlay.width, overlay.height)
  drawOverlay(ctx, result)

  const { results, ms } = await solveInWorker(palette, result.regions.map((r) => ({ id: r.id, lab: r.lab })))
  status.textContent = `${pixels.width}×${pixels.height} px · ${result.regions.length} regions in ${regionMs.toFixed(0)} ms · recipes in ${ms} ms (worker)`

  table.innerHTML =
    '<tr><th>#</th><th>Area</th><th>Target</th><th>Mix</th><th>Recipe (starting point)</th><th>ΔE00</th><th>2nd option</th></tr>' +
    result.regions
      .map((r) => {
        const res = results.find((x) => x.target_id === r.id)!
        const [best, second] = res.options
        return `<tr>
          <td>${r.id}</td><td>${r.area_pct}%</td>
          <td>${chip(r.hex)}</td><td>${chip(best.result_hex)}</td>
          <td>${recipeText(palette, best)}</td>
          <td class="${res.closest_possible ? 'bad' : ''}">${best.delta_e.toFixed(2)}${res.closest_possible ? ' (closest possible)' : ''}</td>
          <td>${second ? `${chip(second.result_hex)} ${recipeText(palette, second)} (${second.delta_e.toFixed(2)})` : ''}</td>
        </tr>`
      })
      .join('')
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (!file) return
  status.textContent = 'Decoding…'
  const canvas = await fileToCanvas(file, 512)
  photo.width = canvas.width
  photo.height = canvas.height
  photo.getContext('2d')!.drawImage(canvas, 0, 0)
  pixels = canvasPixels(photo)
  await run()
})
paletteSelect.addEventListener('change', run)
kInput.addEventListener('input', () => ($('kval').textContent = kInput.value))
kInput.addEventListener('change', run)

overlay.addEventListener('click', (ev) => {
  if (!pixels) return
  const rect = overlay.getBoundingClientRect()
  const x = ((ev.clientX - rect.left) / rect.width) * pixels.width
  const y = ((ev.clientY - rect.top) / rect.height) * pixels.height
  const palette = palettes[paletteSelect.value]
  const res = eyedropper(pixels, x, y, palette)
  eyedrop.innerHTML =
    `Eyedropper at (${x.toFixed(0)}, ${y.toFixed(0)}): ${chip(res.target_hex)} → ` +
    res.options.map((o) => `${chip(o.result_hex)} ${recipeText(palette, o)} (ΔE ${o.delta_e.toFixed(2)})`).join(' &nbsp;or&nbsp; ')
})

// dev.html?img=<url> loads an image without the file picker (for automated checks).
const imgParam = new URLSearchParams(location.search).get('img')
if (imgParam) {
  fetch(imgParam)
    .then((r) => r.blob())
    .then(async (blob) => {
      const canvas = await fileToCanvas(blob, 512)
      photo.width = canvas.width
      photo.height = canvas.height
      photo.getContext('2d')!.drawImage(canvas, 0, 0)
      pixels = canvasPixels(photo)
      await run()
    })
}

// Expose for automated checks from the browser console.
Object.assign(window, { __fieldmixDev: { run, get result() { return result } } })
