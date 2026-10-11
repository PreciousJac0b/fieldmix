/**
 * "Color it in" for outline drawings (sip-and-paint canvases): the painter picks one of
 * their own paints (or a tint of it with white) and taps enclosed shapes to fill them.
 * Colors come only from the painter's choices and paints; nothing is invented here.
 *
 * Model: dark pixels are the outline. The outline is thickened by `closeRadius` so small
 * gaps (JPEG noise, broken strokes) don't let a fill leak into the next shape. Every
 * 4-connected area of non-outline pixels is a fillable shape.
 */

import { rgbaBufferToLab } from './lab.ts'
import type { PixelImage, Region } from './regions.ts'
import { placeLabels } from './regions.ts'

export interface ColoringModel {
  width: number
  height: number
  /** How far (px) the outline was thickened to close gaps. */
  closeRadius: number
  /** 1 where the photo has an outline pixel. */
  line: Uint8Array
  /** 1 where the painter drew an outline of their own (e.g. around curly hair). */
  user: Uint8Array
  /** 1 where fills stop: the thickened outline plus the painter's outlines. */
  wall: Uint8Array
  /** Shape id per pixel, -1 on walls. */
  shape: Int32Array
  shapeCount: number
}

/** Pixels darker than this L* are treated as outline. */
export const LINE_L = 60

/**
 * Default gap closing, measured on a real coloring page (a portrait with open hair
 * strokes): at 1 to 4 px the face, hair and background were one shape; at 5 px they
 * separate while the cap stays its own shape; from 6 px thin shapes start to vanish.
 */
export const DEFAULT_CLOSE_RADIUS = 5

export function buildColoringModel(img: PixelImage, lineL = LINE_L, closeRadius = DEFAULT_CLOSE_RADIUS): ColoringModel {
  const { width, height } = img
  const n = width * height
  const lab = rgbaBufferToLab(img.data)
  const line = new Uint8Array(n)
  for (let i = 0; i < n; i++) line[i] = lab[i * 3] < lineL ? 1 : 0

  const wall = new Uint8Array(n)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!line[y * width + x]) continue
      for (let yy = Math.max(0, y - closeRadius); yy <= Math.min(height - 1, y + closeRadius); yy++) {
        for (let xx = Math.max(0, x - closeRadius); xx <= Math.min(width - 1, x + closeRadius); xx++) wall[yy * width + xx] = 1
      }
    }
  }

  const { shape, shapeCount } = labelShapes(wall, width, height)
  return { width, height, closeRadius, line, user: new Uint8Array(n), wall, shape, shapeCount }
}

/** 4-connected areas of non-wall pixels (a 4-connected fill can't cross an 8-connected wall). */
function labelShapes(wall: Uint8Array, width: number, height: number): { shape: Int32Array; shapeCount: number } {
  const n = width * height
  const shape = new Int32Array(n).fill(-1)
  let shapeCount = 0
  const stack = new Int32Array(n)
  for (let start = 0; start < n; start++) {
    if (wall[start] || shape[start] >= 0) continue
    let top = 0
    stack[top++] = start
    shape[start] = shapeCount
    while (top) {
      const i = stack[--top]
      const x = i % width
      const neighbors = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]
      for (const j of neighbors) {
        if (j < 0 || j >= n || wall[j] || shape[j] >= 0) continue
        shape[j] = shapeCount
        stack[top++] = j
      }
    }
    shapeCount++
  }
  return { shape, shapeCount }
}

/**
 * Rasterize painter-drawn strokes (each a flat [x0, y0, x1, y1, …] list in image px)
 * as solid lines `radius` px either side of the path.
 */
export function rasterizeStrokes(strokes: number[][], width: number, height: number, radius = 1): Uint8Array {
  const mask = new Uint8Array(width * height)
  const stamp = (cx: number, cy: number) => {
    const x0 = Math.round(cx)
    const y0 = Math.round(cy)
    for (let y = Math.max(0, y0 - radius); y <= Math.min(height - 1, y0 + radius); y++) {
      for (let x = Math.max(0, x0 - radius); x <= Math.min(width - 1, x0 + radius); x++) mask[y * width + x] = 1
    }
  }
  for (const pts of strokes) {
    if (pts.length >= 2) stamp(pts[0], pts[1])
    for (let k = 2; k + 1 < pts.length; k += 2) {
      const [ax, ay, bx, by] = [pts[k - 2], pts[k - 1], pts[k], pts[k + 1]]
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2))
      for (let t = 1; t <= steps; t++) stamp(ax + ((bx - ax) * t) / steps, ay + ((by - ay) * t) / steps)
    }
  }
  return mask
}

/** The base model plus the painter's own outlines: shapes are re-found with those as walls. */
export function withOutlines(base: ColoringModel, strokes: number[][]): ColoringModel {
  if (!strokes.length) return base
  const user = rasterizeStrokes(strokes, base.width, base.height)
  const wall = new Uint8Array(base.wall)
  for (let i = 0; i < wall.length; i++) if (user[i]) wall[i] = 1
  const { shape, shapeCount } = labelShapes(wall, base.width, base.height)
  return { ...base, user, wall, shape, shapeCount }
}

/**
 * Fills are stored by where the painter tapped, so they survive shapes changing
 * (a new outline, a different gap setting). Later taps win over earlier ones.
 */
export function resolveFills(m: ColoringModel, taps: { x: number; y: number; key: string }[]): Map<number, string> {
  const fills = new Map<number, string>()
  for (const t of taps) {
    const shape = shapeAt(m, t.x, t.y)
    if (shape >= 0) fills.set(shape, t.key)
  }
  return fills
}

/** The shape under (x, y); a tap on a line snaps to the nearest shape within `snap` px. -1 if none. */
export function shapeAt(m: ColoringModel, x: number, y: number, snap = 6): number {
  const cx = Math.round(x)
  const cy = Math.round(y)
  let best = -1
  let bestD = Infinity
  for (let yy = Math.max(0, cy - snap); yy <= Math.min(m.height - 1, cy + snap); yy++) {
    for (let xx = Math.max(0, cx - snap); xx <= Math.min(m.width - 1, cx + snap); xx++) {
      const s = m.shape[yy * m.width + xx]
      if (s < 0) continue
      const d = (xx - cx) ** 2 + (yy - cy) ** 2
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
  }
  return best
}

type Rgb = [number, number, number]

/**
 * Render the colored-in drawing. Outline pixels get `lineRgb`, the painter's own
 * outlines `userRgb`, filled shapes their color, unfilled shapes `paperRgb`. The thin margin added around lines takes the color
 * of a neighboring filled shape, so fills reach the lines without a white halo.
 */
export function renderColoring(m: ColoringModel, fills: Map<number, Rgb>, lineRgb: Rgb, paperRgb: Rgb, userRgb: Rgb = lineRgb): Uint8ClampedArray<ArrayBuffer> {
  const { width, height, line, user, wall, shape } = m
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    let c: Rgb = paperRgb
    if (line[i]) c = lineRgb
    else if (user[i]) c = userRgb
    else if (!wall[i]) c = fills.get(shape[i]) ?? paperRgb
    else {
      const x = i % width
      const y = (i - x) / width
      search: for (let r = 1; r <= m.closeRadius + 1; r++) {
        for (let yy = Math.max(0, y - r); yy <= Math.min(height - 1, y + r); yy++) {
          for (let xx = Math.max(0, x - r); xx <= Math.min(width - 1, x + r); xx++) {
            const s = shape[yy * width + xx]
            const f = s >= 0 ? fills.get(s) : undefined
            if (f) {
              c = f
              break search
            }
          }
        }
      }
    }
    out[i * 4] = c[0]
    out[i * 4 + 1] = c[1]
    out[i * 4 + 2] = c[2]
    out[i * 4 + 3] = 255
  }
  return out
}

/** One color the painter chose, with how it is mixed from their paints. */
export interface ColorChoice {
  key: string
  hex: string
  lab: [number, number, number]
  parts: { paint_id: string; parts: number }[]
}

/**
 * Turn the colored-in shapes into regions for the planner: one region per chosen color
 * (all its shapes together), in the order colors were first used. Unpainted pixels and
 * lines get label 255 (not a region), since the outline is already on the canvas.
 */
export function regionsFromColoring(
  m: ColoringModel,
  fills: Map<number, string>,
  choices: Map<string, ColorChoice>,
): { regions: Region[]; labelMap: Uint8Array; keys: string[] } {
  const order: string[] = []
  for (const key of fills.values()) if (!order.includes(key)) order.push(key)
  const index = new Map(order.map((k, i) => [k, i]))
  const n = m.width * m.height
  const labelMap = new Uint8Array(n).fill(255)
  const count = new Uint32Array(order.length)
  const sx = new Float64Array(order.length)
  const sy = new Float64Array(order.length)
  const minX = new Int32Array(order.length).fill(m.width)
  const minY = new Int32Array(order.length).fill(m.height)
  const maxX = new Int32Array(order.length).fill(-1)
  const maxY = new Int32Array(order.length).fill(-1)
  for (let i = 0; i < n; i++) {
    const s = m.shape[i]
    const key = s >= 0 ? fills.get(s) : undefined
    if (key === undefined) continue
    const r = index.get(key)!
    labelMap[i] = r
    const x = i % m.width
    const y = (i - x) / m.width
    count[r]++
    sx[r] += x
    sy[r] += y
    if (x < minX[r]) minX[r] = x
    if (y < minY[r]) minY[r] = y
    if (x > maxX[r]) maxX[r] = x
    if (y > maxY[r]) maxY[r] = y
  }
  const cx = order.map((_, r) => sx[r] / count[r])
  const cy = order.map((_, r) => sy[r] / count[r])
  const anchors = placeLabels(labelMap, m.width, m.height, cx, cy)
  const regions: Region[] = order.map((key, r) => {
    const c = choices.get(key)!
    return {
      id: r + 1,
      hex: c.hex,
      lab: c.lab,
      area_pct: Math.round((count[r] / n) * 1000) / 10,
      centroid: [Math.round(cx[r]), Math.round(cy[r])],
      bbox: [minX[r], minY[r], maxX[r] - minX[r] + 1, maxY[r] - minY[r] + 1],
      label_point: anchors[r],
    }
  })
  return { regions, labelMap, keys: order }
}

/** A numbered shape offered for color suggestions. */
export interface NumberedShape {
  shape: number
  number: number
  area_pct: number
  centroid: [number, number]
  bbox: [number, number, number, number]
  /** Where to draw the number (deep inside the shape); also used as the fill tap point. */
  point: [number, number]
}

/** The `max` largest shapes (at least `minPct` of the drawing), numbered 1..n by size. */
export function largestShapes(m: ColoringModel, max = 12, minPct = 0.5): NumberedShape[] {
  const n = m.width * m.height
  const count = new Uint32Array(m.shapeCount)
  for (let i = 0; i < n; i++) if (m.shape[i] >= 0) count[m.shape[i]]++
  const picked = Array.from({ length: m.shapeCount }, (_, s) => s)
    .filter((s) => (count[s] / n) * 100 >= minPct)
    .sort((a, b) => count[b] - count[a])
    .slice(0, max)
  const index = new Map(picked.map((s, i) => [s, i]))
  const labelMap = new Uint8Array(n).fill(255)
  const sx = new Float64Array(picked.length)
  const sy = new Float64Array(picked.length)
  const box = picked.map(() => [m.width, m.height, -1, -1])
  for (let i = 0; i < n; i++) {
    const k = index.get(m.shape[i])
    if (k === undefined) continue
    labelMap[i] = k
    const x = i % m.width
    const y = (i - x) / m.width
    sx[k] += x
    sy[k] += y
    const b = box[k]
    if (x < b[0]) b[0] = x
    if (y < b[1]) b[1] = y
    if (x > b[2]) b[2] = x
    if (y > b[3]) b[3] = y
  }
  const cx = picked.map((s, k) => sx[k] / count[s])
  const cy = picked.map((s, k) => sy[k] / count[s])
  const points = placeLabels(labelMap, m.width, m.height, cx, cy)
  return picked.map((s, k) => ({
    shape: s,
    number: k + 1,
    area_pct: Math.round((count[s] / n) * 1000) / 10,
    centroid: [Math.round(cx[k]), Math.round(cy[k])],
    bbox: [box[k][0], box[k][1], box[k][2] - box[k][0] + 1, box[k][3] - box[k][1] + 1],
    point: points[k],
  }))
}

/**
 * Which numbered shapes touch: two shapes are neighbors if a short hop across a wall
 * (up to 2·closeRadius + 3 px, horizontally or vertically) goes from one to the other.
 */
export function shapeNeighbors(m: ColoringModel, shapes: NumberedShape[]): Map<number, Set<number>> {
  const byShape = new Map(shapes.map((s) => [s.shape, s.number]))
  const out = new Map(shapes.map((s) => [s.number, new Set<number>()]))
  const hop = 2 * m.closeRadius + 3
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const a = byShape.get(m.shape[y * m.width + x])
      if (a === undefined) continue
      const probes = [x + hop < m.width ? y * m.width + x + hop : -1, y + hop < m.height ? (y + hop) * m.width + x : -1]
      for (const j of probes) {
        const b = j >= 0 ? byShape.get(m.shape[j]) : undefined
        if (b === undefined || b === a) continue
        out.get(a)!.add(b)
        out.get(b)!.add(a)
      }
    }
  }
  return out
}

export interface ShapeSuggestion {
  number: number
  paint_id: string
  lighten: 0 | 1 | 3
  reason: string
}

/**
 * Rule-based suggestion (offline, or when Gemma's answer fails validation). It can't
 * tell a face from a cap, so it only makes a tidy scheme: the largest shape touching
 * the edge is the background, in a pale cool paint; every other shape gets a colored
 * paint none of its neighbors use, strongest colors first.
 */
export function ruleBasedSuggestion(
  m: ColoringModel,
  shapes: NumberedShape[],
  neighbors: Map<number, Set<number>>,
  palette: { id: string; hex: string; lab: [number, number, number]; neutral: boolean }[],
  canLighten: boolean,
): ShapeSuggestion[] {
  const colored = palette.filter((p) => !p.neutral)
  const pool = (colored.length ? colored : palette).slice().sort((a, b) => Math.hypot(b.lab[1], b.lab[2]) - Math.hypot(a.lab[1], a.lab[2]))
  // "Touches the edge" allows a margin: a frame line around the picture plus the
  // gap-closing padding keeps every shape a few pixels away from the true edge.
  const margin = Math.max(m.closeRadius + 4, Math.round(0.03 * Math.min(m.width, m.height)))
  const touchesEdge = (s: NumberedShape) =>
    s.bbox[0] <= margin || s.bbox[1] <= margin || s.bbox[0] + s.bbox[2] >= m.width - margin || s.bbox[1] + s.bbox[3] >= m.height - margin
  const background = shapes.find(touchesEdge)
  const hue = (p: (typeof pool)[number]) => ((Math.atan2(p.lab[2], p.lab[1]) * 180) / Math.PI + 360) % 360
  const cool = pool.find((p) => hue(p) >= 180 && hue(p) < 300) ?? pool[pool.length - 1]
  const chosen = new Map<number, string>()
  const out: ShapeSuggestion[] = []
  if (background) {
    chosen.set(background.number, cool.id)
    out.push({ number: background.number, paint_id: cool.id, lighten: canLighten ? 3 : 0, reason: 'background: pale and calm so the drawing stands out' })
  }
  let turn = 0
  for (const s of shapes) {
    if (s === background) continue
    const taken = new Set([...(neighbors.get(s.number) ?? [])].map((n) => chosen.get(n)).filter(Boolean) as string[])
    const pick = pool.find((p, i) => !taken.has(p.id) && i >= turn % pool.length) ?? pool.find((p) => !taken.has(p.id)) ?? pool[turn % pool.length]
    chosen.set(s.number, pick.id)
    out.push({ number: s.number, paint_id: pick.id, lighten: canLighten && turn % 2 === 1 ? 1 : 0, reason: 'different from the shapes next to it' })
    turn++
  }
  return out.sort((a, b) => a.number - b.number)
}
