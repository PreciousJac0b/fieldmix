/**
 * Color-engine eval (the color half of eval/results.md).
 *
 * For every photo, extract regions (k = 6, 512 px long edge) and solve recipes against
 * each eval palette. Reports the share of regions with a recipe under ΔE00 10 and the
 * median best ΔE00. The model half (plan validity, latency) is scripts/eval.py.
 *
 * Usage (from the repo root; Node 24 runs TypeScript directly):
 *   node scripts/eval.ts                      # fixtures/scenes + fixtures/artwork
 *   node scripts/eval.ts a.jpg b.jpg          # specific photos
 *   node scripts/eval.ts --out eval/color.md  # also write a Markdown section
 *
 * macOS only for now: images are decoded with the built-in `sips` tool.
 */

import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { extractRegions } from '../web/src/color/regions.ts'
import { loadImage } from './image_io.ts'
import { EVAL_PALETTES } from '../web/src/color/paints.ts'
import { solveTargets } from '../web/src/color/recipes.ts'

const ROOT = resolve(import.meta.dirname, '..')
const LONG_EDGE = 512
const GOOD_DE = 10

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function defaultPhotos(): string[] {
  const dirs = ['fixtures/scenes', 'fixtures/artwork'].map((d) => join(ROOT, d)).filter(existsSync)
  return dirs.flatMap((d) =>
    readdirSync(d)
      .filter((f) => /\.(jpe?g|png|heic|webp)$/i.test(f))
      .map((f) => join(d, f)),
  )
}

function main(): void {
  const args = process.argv.slice(2)
  const outIdx = args.indexOf('--out')
  const outPath = outIdx >= 0 ? args.splice(outIdx, 2)[1] : null
  const photos = args.length ? args : defaultPhotos()
  if (photos.length === 0) {
    console.error('No photos. Put JPEGs in fixtures/scenes/ or pass paths.')
    process.exit(2)
  }

  const lines: string[] = []
  const log = (s = '') => {
    console.log(s)
    lines.push(s)
  }
  log('## Color engine')
  log()
  log(`Regions: k = 6, ${LONG_EDGE} px long edge, merge < ΔE00 6, specks < 1% absorbed. Recipes: 1–3 colored paints + white/black, parts 1–6.`)
  log()
  log('| Photo | Palette | Regions | Under ΔE 10 | Median ΔE | Worst ΔE | Solve ms |')
  log('| --- | --- | ---: | ---: | ---: | ---: | ---: |')

  const totals: Record<string, number[]> = {}
  for (const photo of photos) {
    const img = loadImage(photo, LONG_EDGE)
    const { regions } = extractRegions(img, { k: 6, seed: 1 })
    for (const [name, palette] of Object.entries(EVAL_PALETTES)) {
      const t0 = performance.now()
      const res = solveTargets(palette, regions.map((r) => ({ id: r.id, lab: r.lab })))
      const ms = performance.now() - t0
      const des = res.map((r) => r.options[0].delta_e)
      ;(totals[name] ??= []).push(...des)
      const good = des.filter((d) => d < GOOD_DE).length
      log(`| ${basename(photo)} | ${name} | ${regions.length} | ${good}/${des.length} (${Math.round((100 * good) / des.length)}%) | ${median(des).toFixed(2)} | ${Math.max(...des).toFixed(2)} | ${ms.toFixed(0)} |`)
    }
  }
  log()
  log('| Palette | Regions | Under ΔE 10 | Median ΔE |')
  log('| --- | ---: | ---: | ---: |')
  for (const [name, des] of Object.entries(totals)) {
    const good = des.filter((d) => d < GOOD_DE).length
    log(`| ${name} | ${des.length} | ${Math.round((100 * good) / des.length)}% | ${median(des).toFixed(2)} |`)
  }
  if (outPath) writeFileSync(resolve(ROOT, outPath), lines.join('\n') + '\n')
}

main()
