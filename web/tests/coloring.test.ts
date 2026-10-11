import { describe, expect, it } from 'vitest'
import { buildColoringModel, regionsFromColoring, renderColoring, shapeAt, type ColorChoice } from '../src/color/coloring.ts'
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
