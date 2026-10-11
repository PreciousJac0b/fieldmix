/**
 * Paint mode: one step per screen in large type, read aloud, with a test-dab card for
 * every mix. Recipe text and amounts always come from the color engine; Gemma only
 * supplies titles, instructions and tips.
 */

import { ask } from '../api.ts'
import { resolveTestDab, type DabFeedback } from '../color/adjust.ts'
import { mixPaints } from '../color/mix.ts'
import { quality, recipeDots, recipeText, regionLabel, spokenStep, type Session } from '../session.ts'
import { speak, speechAvailable, stopSpeaking, unlock } from '../speech.ts'
import { loadPhoto } from './capture.ts'
import { chip, h, mount } from './dom.ts'
import { allowSleep, keepAwake } from './wakeLock.ts'

const FEEDBACK: [DabFeedback, string][] = [
  ['too_light', 'Too light'],
  ['too_dark', 'Too dark'],
  ['too_dull', 'Too dull'],
  ['too_bright', 'Too bright'],
  ['looks_right', 'Looks right'],
]

function sourceNote(s: Session): HTMLElement {
  if (s.plan?.source === 'gemma') return h('p', { class: 'muted' }, 'Plan written by Gemma running on your laptop.')
  if (s.offline) return h('p', {}, h('span', { class: 'offline' }, 'Offline mode'), ' Plan made on this phone, no laptop needed.')
  return h('p', { class: 'muted' }, 'Gemma was unavailable, so this is a simpler built-in plan.')
}

function mixCard(s: Session, regionId: number): HTMLElement {
  const card = h('div', { class: 'card' })
  const render = (message?: string) => {
    const parts = s.working.get(regionId) ?? []
    const region = s.regions?.regions.find((r) => r.id === regionId)
    const best = s.recipes.find((r) => Number(r.target_id) === regionId)?.options[0]
    const mixHex = parts.length ? mixPaints(parts.map((p) => ({ hex: s.palette.find((q) => q.id === p.paint_id)?.hex ?? '#888', parts: p.parts }))).hex : '#888'
    const q = best ? quality(best.delta_e) : null
    card.replaceChildren(
      h('div', { class: 'row' }, h('span', { class: 'num' }, String(regionId)), h('strong', {}, regionLabel(s.plan, regionId))),
      h('div', { class: 'row', style: 'margin:8px 0' }, region ? chip(region.hex, 'target') : '', h('span', {}, '→'), chip(mixHex, 'your mix'), h('span', { class: 'muted' }, 'target → your mix')),
      ...recipeDots(s.palette, parts).map((d) => h('div', { class: 'dotrow' }, chip(d.hex, d.name), h('span', { class: 'dots', 'aria-hidden': 'true' }, d.dots), h('span', {}, d.name))),
      h('p', {}, h('strong', {}, recipeText(s.palette, parts))),
      h('p', { class: 'row' }, q ? h('span', { class: `badge ${q.cls}` }, q.label) : null, h('span', { class: 'starting' }, 'Starting point')),
      h('p', {}, 'Mix a pea-sized amount, dab it on the edge of the canvas, and compare. How does it look?'),
      h(
        'div',
        { class: 'dab' },
        ...FEEDBACK.map(([fb, label]) =>
          h(
            'button',
            {
              type: 'button',
              class: fb === 'looks_right' ? 'wide primary' : '',
              onclick: () => {
                const result = resolveTestDab(parts, fb, s.palette)
                if (result.kind === 'change') s.working.set(regionId, result.parts)
                const text = result.kind === 'change' ? `${result.message} New mix: ${recipeText(s.palette, result.parts)}.` : result.message
                render(text)
                speak(text)
              },
            },
            label,
          ),
        ),
      ),
      message ? h('p', { class: 'answer card', role: 'status' }, message) : '',
    )
  }
  render()
  return card
}

function askPanel(s: Session, stepOrder: number): HTMLElement {
  const panel = h('div', { class: 'card hidden' })
  const question = h('textarea', { rows: 2, placeholder: 'For example: my sky looks flat, what should I do?', 'aria-label': 'Your question' })
  const photoInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' })
  const photoNote = h('span', { class: 'muted' })
  let photoB64: string | undefined
  photoInput.addEventListener('change', async () => {
    const f = photoInput.files?.[0]
    if (!f) return
    photoB64 = (await loadPhoto(f)).jpeg768
    photoNote.textContent = 'Photo attached ✓'
  })
  const answer = h('p', { class: 'answer card hidden', role: 'status' })
  const send = h('button', { type: 'button', class: 'primary' }, 'Ask')
  send.addEventListener('click', async () => {
    if (!question.value.trim() || !s.plan) return
    if (s.offline) {
      answer.textContent = 'Questions need the laptop running Gemma. Your mixes and steps still work offline.'
      answer.classList.remove('hidden')
      return
    }
    send.disabled = true
    answer.textContent = 'Thinking…'
    answer.classList.remove('hidden')
    try {
      const text = await ask(question.value.trim(), s.plan, stepOrder, photoB64)
      answer.textContent = text
      speak(text)
    } catch {
      answer.textContent = "Couldn't reach the laptop. Check the Wi-Fi or hotspot and try again."
    } finally {
      send.disabled = false
    }
  })
  panel.append(
    question,
    photoInput,
    h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { type: 'button', onclick: () => photoInput.click() }, 'Add photo of my painting'), photoNote, h('span', { class: 'spacer' }), send),
    answer,
  )
  return panel
}

function stepScreen(s: Session, onExit: () => void): HTMLElement {
  const plan = s.plan!
  const step = plan.steps[s.stepIndex]
  const total = plan.steps.length
  const ask = askPanel(s, step.order)
  const go = (delta: number) => {
    const next = s.stepIndex + delta
    if (next < 0) return
    if (next >= total) {
      stopSpeaking()
      allowSleep()
      mount(doneScreen(s, onExit))
      return
    }
    s.stepIndex = next
    showStep(s, onExit)
  }
  return h(
    'div',
    { class: 'paint' },
    h('div', { class: 'row' }, h('span', { class: 'muted' }, `Step ${step.order} of ${total} · about ${step.est_minutes} min`), h('span', { class: 'spacer' }), s.offline ? h('span', { class: 'offline' }, 'Offline mode') : null),
    h('h1', {}, step.title),
    h('p', { class: 'instruction' }, step.instruction),
    ...step.region_ids.map((id) => mixCard(s, id)),
    h('p', { class: 'tip' }, step.technique_tip),
    h(
      'div',
      { class: 'row' },
      speechAvailable() ? h('button', { type: 'button', onclick: () => speak(spokenStep(s, step)) }, '🔊 Repeat') : null,
      h('button', { type: 'button', onclick: () => ask.classList.toggle('hidden') }, 'Ask a question'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', onclick: () => { stopSpeaking(); allowSleep(); onExit() } }, 'Exit'),
    ),
    ask,
    h(
      'div',
      { class: 'nav' },
      h('button', { type: 'button', disabled: s.stepIndex === 0, onclick: () => go(-1) }, '◀ Back'),
      h('button', { type: 'button', class: 'primary', onclick: () => go(1) }, s.stepIndex === total - 1 ? 'Finish' : 'Next ▶'),
    ),
  )
}

function showStep(s: Session, onExit: () => void): void {
  mount(stepScreen(s, onExit))
  speak(spokenStep(s, s.plan!.steps[s.stepIndex]))
}

function doneScreen(s: Session, onExit: () => void): HTMLElement {
  return h(
    'div',
    { class: 'paint' },
    h('h1', {}, 'Done. Step back and look.'),
    h('p', {}, 'Squint at the scene and your painting side by side. If one area jumps out, go back to its step and use the test-dab buttons.'),
    h('button', { type: 'button', class: 'big full', onclick: () => { s.stepIndex = s.plan!.steps.length - 1; showStep(s, onExit) } }, 'Back to the last step'),
    h('button', { type: 'button', class: 'primary big full', style: 'margin-top:12px', onclick: onExit }, 'Back to the color map'),
  )
}

/** Plan overview with the "Start painting" tap (unlocks audio and keeps the screen on). */
export function renderPaintIntro(s: Session, onExit: () => void): HTMLElement {
  const plan = s.plan!
  const total = plan.steps.reduce((m, st) => m + st.est_minutes, 0)
  const start = h('button', { type: 'button', class: 'primary big full' }, 'Start painting')
  start.addEventListener('click', async () => {
    unlock()
    await keepAwake()
    s.stepIndex = 0
    showStep(s, onExit)
  })
  return h(
    'div',
    { class: 'paint' },
    h('h1', {}, 'Your painting plan'),
    sourceNote(s),
    h('p', {}, `${plan.steps.length} steps, about ${total} minutes. Each step is read aloud; tap Next with a clean knuckle.`),
    h('ol', {}, ...plan.steps.map((st) => h('li', {}, `${st.title} (${st.est_minutes} min)`))),
    start,
    h('button', { type: 'button', class: 'full', style: 'margin-top:12px', onclick: onExit }, 'Back to the color map'),
  )
}
