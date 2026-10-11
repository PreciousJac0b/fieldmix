import { describe, expect, it } from 'vitest'
import { buildColoringModel, largestShapes, rasterizeStrokes, regionsFromColoring, renderColoring, resolveFills, ruleBasedSuggestion, shapeAt, shapeNeighbors, withOutlines, type ColorChoice } from '../src/color/coloring.ts'
import { makeImage } from './helpers.ts'

const WHITE: [number, number, number] = [250, 250, 250]
const BLACK: [number, number, number] = [20, 20, 20]

/** 60 × 40 page with a black box outline from (10,10) to (29,29) and a vertical line at x = 45. */
function drawing(gapAt?: number) {
  return makeImage(60, 40, (x, y) => {
    const onBox = (x === 10 || x === 29) && y >= 10 && y <= 29 ? true : (y === 10 || y === 29) && x >= 10 && x <= 29
    const onBar = x === 45
    if (gapAt !== undefined && x === 10 && y === gapAt) return WHITE // a 1 px break in the box
    return onBox || onBar ? BLACK : WHITE
  })
}

describe('buildColoringModel', () => {
  it('finds the shapes the outline encloses', () => {
    const m = buildColoringModel(drawing())
    const inside = shapeAt(m, 20, 20)
    const outsideLeft = shapeAt(m, 2, 2)
    const rightOfBar = shapeAt(m, 55, 20)
    expect(inside).toBeGreaterThanOrEqual(0)
    expect(new Set([inside, outsideLeft, rightOfBar]).size).toBe(3)
    expect(shapeAt(m, 2, 38)).toBe(outsideLeft) // the page around the box is one shape
  })

  it('closes a 1 px gap so a fill does not leak out of the box', () => {
    const m = buildColoringModel(drawing(20), 60, 1)
    expect(shapeAt(m, 20, 20)).not.toBe(shapeAt(m, 2, 2))
  })

  it('a larger radius closes larger gaps; a smaller one lets the fill leak', () => {
    // A 5 px break in the box's left side (y = 18..22).
    const img = makeImage(60, 40, (x, y) => {
      const onBox = ((x === 10 || x === 29) && y >= 10 && y <= 29) || ((y === 10 || y === 29) && x >= 10 && x <= 29)
      if (x === 10 && y >= 18 && y <= 22) return WHITE
      return onBox ? BLACK : WHITE
    })
    const leaky = buildColoringModel(img, 60, 1)
    expect(shapeAt(leaky, 20, 20)).toBe(shapeAt(leaky, 2, 2))
    const closed = buildColoringModel(img, 60, 3)
    expect(shapeAt(closed, 20, 20)).not.toBe(shapeAt(closed, 2, 2))
  })

  it('snaps a tap on a line to the nearest shape', () => {
    const m = buildColoringModel(drawing())
    expect(shapeAt(m, 45, 20)).toBeGreaterThanOrEqual(0)
    expect(m.shape[20 * 60 + 45]).toBe(-1)
  })
})

describe('renderColoring', () => {
  it('fills the chosen shape up to the line, keeps lines dark and other shapes paper', () => {
    const m = buildColoringModel(drawing(), 60, 1)
    const red: [number, number, number] = [200, 30, 30]
    const out = renderColoring(m, new Map([[shapeAt(m, 20, 20), red]]), [30, 30, 30], [244, 243, 238])
    const px = (x: number, y: number) => Array.from(out.slice((y * 60 + x) * 4, (y * 60 + x) * 4 + 3))
    expect(px(20, 20)).toEqual(red)
    expect(px(11, 20)).toEqual(red) // the margin next to the line takes the fill: no white halo
    expect(px(10, 20)).toEqual([30, 30, 30]) // the line itself
    expect(px(2, 2)).toEqual([244, 243, 238]) // unfilled page
  })
})

describe('regionsFromColoring', () => {
  it('makes one region per chosen color, grouping its shapes, and leaves the rest unlabeled', () => {
    const m = buildColoringModel(drawing())
    const box = shapeAt(m, 20, 20)
    const right = shapeAt(m, 55, 20)
    const page = shapeAt(m, 2, 2)
    const choices = new Map<string, ColorChoice>([
      ['red', { key: 'red', hex: '#c81e1e', lab: [44, 64, 45], parts: [{ paint_id: 'cad-red', parts: 1 }] }],
      ['blue', { key: 'blue', hex: '#243b8f', lab: [27, 18, -48], parts: [{ paint_id: 'ultramarine', parts: 1 }] }],
    ])
    const fills = new Map([
      [box, 'red'],
      [right, 'blue'],
      [page, 'red'],
    ])
    const { regions, labelMap } = regionsFromColoring(m, fills, choices)
    expect(regions.map((r) => r.hex)).toEqual(['#c81e1e', '#243b8f'])
    expect(regions.map((r) => r.id)).toEqual([1, 2])
    expect(labelMap[20 * 60 + 20]).toBe(0)
    expect(labelMap[2 * 60 + 2]).toBe(0) // page is also red
    expect(labelMap[20 * 60 + 55]).toBe(1)
    expect(labelMap[20 * 60 + 10]).toBe(255) // the outline is not a region
    for (const r of regions) expect(labelMap[r.label_point[1] * 60 + r.label_point[0]]).toBe(r.id - 1)
  })
})

describe('painter-drawn outlines', () => {
  // An open page: one curly stroke that encloses nothing, like a loose curl of hair.
  const page = () => makeImage(80, 40, (x, y) => (Math.abs(y - 20 - 6 * Math.sin(x / 5)) < 1 && x > 20 && x < 60 ? BLACK : WHITE))

  it('rasterizes a stroke as a solid line, including between sampled points', () => {
    const mask = rasterizeStrokes([[10, 5, 10, 35]], 80, 40, 1)
    for (let y = 5; y <= 35; y++) expect(mask[y * 80 + 10]).toBe(1)
    expect(mask[20 * 80 + 13]).toBe(0)
  })

  it('a drawn outline splits an open area into two shapes', () => {
    const base = buildColoringModel(page(), 60, 1)
    expect(shapeAt(base, 5, 5)).toBe(shapeAt(base, 75, 5)) // the curl encloses nothing
    const split = withOutlines(base, [[40, 0, 40, 39]])
    expect(shapeAt(split, 5, 5)).not.toBe(shapeAt(split, 75, 5))
    expect(split.user[20 * 80 + 40]).toBe(1)
    expect(base.user.every((v) => v === 0)).toBe(true) // the base model is not modified
  })

  it('fills are kept by tap position, so they survive a new outline', () => {
    const base = buildColoringModel(page(), 60, 1)
    const taps = [{ x: 5, y: 5, key: 'red' }]
    expect([...resolveFills(base, taps).values()]).toEqual(['red'])
    const split = withOutlines(base, [[40, 0, 40, 39]])
    const fills = resolveFills(split, taps)
    expect(fills.get(shapeAt(split, 5, 5))).toBe('red')
    expect(fills.has(shapeAt(split, 75, 5))).toBe(false) // the other side is no longer red
  })

  it('a later tap on the same shape wins', () => {
    const base = buildColoringModel(page(), 60, 1)
    const fills = resolveFills(base, [
      { x: 5, y: 5, key: 'red' },
      { x: 70, y: 30, key: 'blue' },
    ])
    expect([...fills.values()]).toEqual(['blue'])
  })

  it('renders the painter’s outline in its own color', () => {
    const m = withOutlines(buildColoringModel(page(), 60, 1), [[40, 0, 40, 39]])
    const out = renderColoring(m, new Map(), [30, 30, 30], [250, 250, 250], [30, 90, 200])
    expect(Array.from(out.slice((5 * 80 + 40) * 4, (5 * 80 + 40) * 4 + 3))).toEqual([30, 90, 200])
  })
})

describe('color suggestions (numbering, neighbors, rule-based fallback)', () => {
  // Page split into: background, a big box, and two small boxes side by side inside it.
  const img = () =>
    makeImage(100, 80, (x, y) => {
      const rect = (x0: number, y0: number, x1: number, y1: number) => ((x === x0 || x === x1) && y >= y0 && y <= y1) || ((y === y0 || y === y1) && x >= x0 && x <= x1)
      return rect(10, 10, 89, 69) || rect(20, 20, 49, 59) || rect(50, 20, 79, 59) ? BLACK : WHITE
    })
  const palette = [
    { id: 'red', hex: '#d93a2b', lab: [52, 62, 45] as [number, number, number], neutral: false },
    { id: 'blue', hex: '#243b8f', lab: [27, 18, -48] as [number, number, number], neutral: false },
    { id: 'yellow', hex: '#f9d71c', lab: [87, -3, 83] as [number, number, number], neutral: false },
    { id: 'white', hex: '#f4f3ee', lab: [96, 0, 2] as [number, number, number], neutral: true },
  ]

  it('numbers the largest shapes by size, each number inside its shape', () => {
    const m = buildColoringModel(img(), 60, 1)
    const shapes = largestShapes(m, 12, 0.5)
    expect(shapes.length).toBeGreaterThanOrEqual(3)
    expect(shapes.map((s) => s.number)).toEqual(shapes.map((_, i) => i + 1))
    for (let i = 1; i < shapes.length; i++) expect(shapes[i - 1].area_pct).toBeGreaterThanOrEqual(shapes[i].area_pct)
    for (const s of shapes) expect(m.shape[s.point[1] * m.width + s.point[0]]).toBe(s.shape)
  })

  it('finds shapes that touch across a line', () => {
    const m = buildColoringModel(img(), 60, 1)
    const shapes = largestShapes(m, 12, 0.5)
    const left = shapes.find((s) => s.shape === shapeAt(m, 35, 40))!
    const right = shapes.find((s) => s.shape === shapeAt(m, 65, 40))!
    const nb = shapeNeighbors(m, shapes)
    expect(nb.get(left.number)!.has(right.number)).toBe(true)
  })

  it('rule-based: pale background, colored paints only, neighbors never share a paint', () => {
    const m = buildColoringModel(img(), 60, 1)
    const shapes = largestShapes(m, 12, 0.5)
    const nb = shapeNeighbors(m, shapes)
    const sug = ruleBasedSuggestion(m, shapes, nb, palette, true)
    expect(sug.map((s) => s.number)).toEqual(shapes.map((s) => s.number))
    const bg = shapes.find((s) => s.shape === shapeAt(m, 2, 2))!
    const bgSug = sug.find((s) => s.number === bg.number)!
    expect(bgSug.paint_id).toBe('blue') // the cool paint
    expect(bgSug.lighten).toBe(3)
    expect(sug.every((s) => s.paint_id !== 'white')).toBe(true)
    const paintOf = new Map(sug.map((s) => [s.number, s.paint_id]))
    for (const [a, set] of nb) for (const b of set) expect(paintOf.get(a)).not.toBe(paintOf.get(b))
  })

  it('rule-based finds the background even when a frame line keeps shapes off the edge', () => {
    // Same drawing inside a black frame 1 px from the edge.
    const framed = makeImage(100, 80, (x, y) => {
      if (x === 1 || y === 1 || x === 98 || y === 78) return BLACK
      const rect = (x0: number, y0: number, x1: number, y1: number) => ((x === x0 || x === x1) && y >= y0 && y <= y1) || ((y === y0 || y === y1) && x >= x0 && x <= x1)
      return rect(10, 10, 89, 69) || rect(20, 20, 49, 59) || rect(50, 20, 79, 59) ? BLACK : WHITE
    })
    const m = buildColoringModel(framed, 60, 1)
    const shapes = largestShapes(m, 12, 0.5)
    const sug = ruleBasedSuggestion(m, shapes, shapeNeighbors(m, shapes), palette, true)
    const bg = shapes.find((s) => s.shape === shapeAt(m, 5, 5))!
    expect(sug.find((s) => s.number === bg.number)!.lighten).toBe(3)
  })

  it('rule-based without white never lightens', () => {
    const m = buildColoringModel(img(), 60, 1)
    const shapes = largestShapes(m, 12, 0.5)
    const sug = ruleBasedSuggestion(m, shapes, shapeNeighbors(m, shapes), palette.slice(0, 3), false)
    expect(sug.every((s) => s.lighten === 0)).toBe(true)
  })
})
