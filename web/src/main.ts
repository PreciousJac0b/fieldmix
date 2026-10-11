/**
 * Fieldmix app: Setup → Photo → Paints → Color map → Plan → Paint mode.
 * Regions and recipes are computed on the phone; the plan comes from Gemma on the
 * laptop when it is reachable, and from the built-in fallback planner when it is not.
 */

import './style.css'
import { health, requestPlan } from './api.ts'
import { fallbackPlan } from './plan/fallback.ts'
import { buildPlanRequest, newSession, type Session } from './session.ts'
import { loadPhoto, renderCapture } from './ui/capture.ts'
import { h, mount } from './ui/dom.ts'
import { renderPaintIntro } from './ui/paintMode.ts'
import { renderPalette } from './ui/palette.ts'
import { computeRegions, renderRegionMap } from './ui/regionMap.ts'
import { renderSettings } from './ui/settings.ts'
import { renderSetup } from './ui/setup.ts'

const s: Session = newSession()

function loading(text: string): void {
  mount(h('div', {}, h('h1', {}, 'Fieldmix'), h('p', { role: 'status' }, text)))
}

function goSetup(): void {
  mount(renderSetup(s, goCapture, goSettings))
}

function goSettings(): void {
  mount(renderSettings(goSetup))
}

function goCapture(): void {
  mount(renderCapture(s, goPalette, goSetup))
}

function goPalette(): void {
  mount(renderPalette(s, goMap, goCapture))
}

async function goMap(): Promise<void> {
  loading('Finding color regions and working out mixes from your paints…')
  try {
    await computeRegions(s)
  } catch (err) {
    mount(h('div', {}, h('h1', {}, 'Something went wrong'), h('p', {}, String(err)), h('button', { type: 'button', onclick: goPalette }, 'Back')))
    return
  }
  showMap()
}

function showMap(): void {
  mount(renderRegionMap(s, makePlan, goPalette, goCapture))
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
  mount(renderPaintIntro(s, showMap))
}

/** ?photo=<url> preloads a photo and jumps to the palette screen (for demos and automated checks). */
async function boot(): Promise<void> {
  const photoUrl = new URLSearchParams(location.search).get('photo')
  if (photoUrl) {
    loading('Loading photo…')
    try {
      s.photo = await loadPhoto(await (await fetch(photoUrl)).blob())
      goPalette()
      return
    } catch {
      /* fall through to the normal start */
    }
  }
  goSetup()
}

void boot()
