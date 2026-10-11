/**
 * Build a /api/plan request body from a photo, exactly as the browser would:
 * regions from a 512 px copy, recipes for the student palette, and a 768 px JPEG.
 *
 * Usage (from the repo root):
 *   node scripts/make_plan_request.ts --out eval/requests photo1.jpg photo2.jpg
 *   options: --medium acrylic|watercolor|oil|gouache  --minutes 60  --mode scene|artwork
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { EVAL_PALETTES } from '../web/src/color/paints.ts'
import { solveTargets } from '../web/src/color/recipes.ts'
import { extractRegions } from '../web/src/color/regions.ts'
import { jpegBase64, loadImage } from './image_io.ts'

function option(args: string[], name: string, fallback: string): string {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : fallback
}

const args = process.argv.slice(2)
const outDir = resolve(option(args, '--out', 'eval/requests'))
const medium = option(args, '--medium', 'acrylic')
const minutes = Number(option(args, '--minutes', '60'))
const mode = option(args, '--mode', 'scene')
const palette = EVAL_PALETTES.student
mkdirSync(outDir, { recursive: true })

for (const photo of args) {
  const { regions } = extractRegions(loadImage(photo, 512), { k: 6, seed: 1 })
  const solved = solveTargets(palette, regions.map((r) => ({ id: r.id, lab: r.lab })))
  const body = {
    image_b64: jpegBase64(photo, 768),
    mode,
    medium,
    minutes,
    palette: palette.map(({ id, name, hex }) => ({ id, name, hex })),
    regions: regions.map(({ id, hex, lab, area_pct, centroid, bbox }) => ({ id, hex, lab, area_pct, centroid, bbox })),
    recipes: solved.map((s) => ({
      region_id: s.target_id,
      parts: s.options[0].parts,
      result_hex: s.options[0].result_hex,
      delta_e: s.options[0].delta_e,
    })),
  }
  const name = basename(photo, extname(photo)).replace(/\s+/g, '_')
  const file = join(outDir, `${name}.${medium}.json`)
  writeFileSync(file, JSON.stringify(body))
  console.log(`${file}: ${regions.length} regions, image ${Math.round(body.image_b64.length / 1024)} KB base64`)
}
