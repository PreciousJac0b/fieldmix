/**
 * Fieldmix app: Home → Subject → Session (time, paint, photo) → Paints → Colors → Plan → Paint mode.
 * Each page has its own URL hash, so Android's back button moves between pages instead of
 * leaving the app. Regions and recipes are computed on the phone; the plan comes from
 * Gemma on the laptop when it is reachable, and from the built-in fallback planner when not.
 */

import './style.css'
import { health, requestPlan } from './api.ts'
import { fallbackPlan } from './plan/fallback.ts'
import { parseRoute, PREVIOUS, resolveRoute, routeHash, type Route } from './router.ts'
import { buildPlanRequest, newSession, type Session } from './session.ts'
import { stopSpeaking } from './speech.ts'
import { loadPhoto } from './ui/capture.ts'
import { h, mount } from './ui/dom.ts'
import { renderHome } from './ui/home.ts'
import { loadingScreen, page } from './ui/layout.ts'
import { renderMode } from './ui/mode.ts'
import { renderPaintIntro, showStep } from './ui/paintMode.ts'
import { renderPalette } from './ui/palette.ts'
import { computeRegions, renderRegionMap } from './ui/regionMap.ts'
import { renderSettings } from './ui/settings.ts'
import { renderSetup } from './ui/setup.ts'
import { allowSleep } from './ui/wakeLock.ts'

const s: Session = newSession()

// History entries this app pushed, by index, so in-page Back can use the browser's back
// (keeping Android's back button in step) when the previous entry is the page it wants.
let stack: Route[] = []
let index = 0
// Bumped on every render so a slow page (computing regions) never replaces a newer one.
let renderId = 0
// The palette and color count the current regions were computed for.
let regionsFor = ''

const MIN_LOADER_MS = 900

const regionsKey =(sess: Session) => `${sess.setup.k}|${sess.palette.map((p) => `${p.id}:${p.hex}`).join(',')}`

function go(route: Route, replace = false): void {
  if (replace) stack[index] = route
  else {
    stack = stack.slice(0, index + 1)
    stack.push(route)
    index = stack.length - 1
  }
  const state = { i: index }
  if (replace) history.replaceState(state, '', routeHash(route))
  else history.pushState(state, '', routeHash(route))
  void render()
}

/** In-page Back: the browser's back when it leads to the expected page, else a fresh push. */
function back(from: Route): void {
  const to = PREVIOUS[from]
  if (index > 0 && stack[index - 1] === to) history.back()
  else go(to)
}

addEventListener('popstate', (e: PopStateEvent) => {
  const i = (e.state as { i?: number } | null)?.i
  index = typeof i === 'number' ? i : 0
  stack[index] = parseRoute(location.hash)
  void render()
})

async function render(): Promise<void> {
  const id = ++renderId
  const want = parseRoute(location.hash)
  const route = resolveRoute(want, { hasPhoto: !!s.photo, hasPalette: s.palette.length > 0, hasPlan: !!s.plan })
  if (route !== want) {
    stack[index] = route
    history.replaceState({ i: index }, '', routeHash(route))
  }
  if (route !== 'paint') {
    stopSpeaking()
    allowSleep()
  }
  switch (route) {
    case 'home':
      return mount(renderHome(() => go('mode'), () => go('settings')))
    case 'settings':
      return mount(page('settings', () => back('settings'), renderSettings(() => back('settings'))))
    case 'mode':
      return mount(renderMode(s, () => go('setup'), () => back('mode')))
    case 'setup':
      return mount(renderSetup(s, () => go('paints'), () => back('setup')))
    case 'paints':
      return mount(renderPalette(s, () => go('map'), () => back('paints'), () => go('setup')))
    case 'map': {
      const key = regionsKey(s)
      if (!s.regions || regionsFor !== key) {
        mount(loadingScreen('Finding the colors in your photo and working out mixes from your paints…'))
        const shownAt = performance.now()
        try {
          // k-means runs on this thread, so let the loader paint first, and keep it up
          // long enough to read instead of flashing.
          await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)))
          await computeRegions(s)
          await new Promise((r) => setTimeout(r, Math.max(0, MIN_LOADER_MS - (performance.now() - shownAt))))
          regionsFor = key
        } catch (err) {
          if (id === renderId) mount(page('map', () => back('map'), h('h1', {}, 'Something went wrong'), h('p', {}, String(err))))
          return
        }
        if (id !== renderId) return
      }
      return mount(page('map', () => back('map'), renderRegionMap(s, makePlan, () => go('setup'))))
    }
    case 'plan':
      return mount(page('plan', () => back('plan'), renderPaintIntro(s, () => go('paint'))))
    case 'paint':
      return showStep(s, () => go('map'))
  }
}

async function makePlan(): Promise<void> {
  const req = buildPlanRequest(s)
  const backend = await health()
  if (backend) {
    try {
      s.plan = await requestPlan(req)
      s.offline = false
    } catch {
      s.plan = { ...fallbackPlan(req), source: 'fallback' }
      s.offline = true
    }
  } else {
    s.plan = { ...fallbackPlan(req), source: 'fallback' }
    s.offline = true
  }
  s.stepIndex = 0
  go('plan')
}

/** ?photo=<url> preloads a photo and opens the Paints page (for demos and automated checks). */
async function boot(): Promise<void> {
  const photoUrl = new URLSearchParams(location.search).get('photo')
  if (photoUrl) {
    mount(loadingScreen('Loading photo…'))
    try {
      s.photo = await loadPhoto(await (await fetch(photoUrl)).blob())
      stack = ['paints']
      history.replaceState({ i: 0 }, '', routeHash('paints'))
      return render()
    } catch {
      /* fall through to the normal start */
    }
  }
  // A reload lands on Home: the session (photo, palette) lives only in memory.
  stack = ['home']
  history.replaceState({ i: 0 }, '', routeHash('home'))
  return render()
}

void boot()
