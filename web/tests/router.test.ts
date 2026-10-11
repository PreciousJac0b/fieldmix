import { describe, expect, it } from 'vitest'
import { parseRoute, PREVIOUS, resolveRoute, routeHash, stepNumber, type Route } from '../src/router.ts'

const none = { hasPhoto: false, hasPalette: false, hasPlan: false }
const all = { hasPhoto: true, hasPalette: true, hasPlan: true }

describe('router', () => {
  it('parses and builds hashes', () => {
    expect(parseRoute('')).toBe('home')
    expect(parseRoute('#/')).toBe('home')
    expect(parseRoute('#/paints')).toBe('paints')
    expect(parseRoute('#/nope')).toBe('home')
    for (const r of ['home', 'mode', 'setup', 'paints', 'map', 'plan', 'paint', 'settings'] as Route[]) {
      expect(parseRoute(routeHash(r))).toBe(r)
    }
  })

  it('always shows the pages that need nothing', () => {
    for (const r of ['home', 'mode', 'setup', 'settings'] as Route[]) expect(resolveRoute(r, none)).toBe(r)
  })

  it('falls back to the latest page that can be shown', () => {
    expect(resolveRoute('paints', none)).toBe('setup')
    expect(resolveRoute('map', none)).toBe('setup')
    expect(resolveRoute('map', { ...none, hasPhoto: true })).toBe('paints')
    expect(resolveRoute('plan', { ...none, hasPhoto: true, hasPalette: true })).toBe('map')
    expect(resolveRoute('paint', none)).toBe('setup')
    expect(resolveRoute('paint', all)).toBe('paint')
  })

  it('numbers the flow steps and links each page back to the one before', () => {
    expect(stepNumber('home')).toBe(0)
    expect(stepNumber('mode')).toBe(1)
    expect(stepNumber('map')).toBe(4)
    expect(stepNumber('paint')).toBe(5)
    expect(PREVIOUS.paints).toBe('setup')
    expect(PREVIOUS.mode).toBe('home')
  })
})
