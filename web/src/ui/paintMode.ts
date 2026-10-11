/**
 * Paint mode: one step per screen in large type, read aloud, with a test-dab card for
 * every mix. Recipe text and amounts always come from the color engine; Gemma only
 * supplies titles, instructions and tips.
 */

import { ask, type Step } from '../api.ts'
import { resolveTestDab, type DabFeedback } from '../color/adjust.ts'
import { mixPaints } from '../color/mix.ts'
import { quality, recipeDots, recipeText, regionLabel, spokenStep, type Session } from '../session.ts'
import { getSpeaker, speak, speechAvailable, stopSpeaking, unlock, type SpeechState } from '../speech.ts'
import { loadPhoto } from './capture.ts'
import { chip, h, mount } from './dom.ts'
import { heroArt, icon, type IconName } from './icons.ts'
import { actionBar, pageTitle } from './layout.ts'
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

const PAUSE_LABELS: Record<SpeechState, [IconName, string, string]> = {
  speaking: ['pause', 'Pause', 'Pause the spoken step'],
  paused: ['play', 'Resume', 'Resume the spoken step'],
  idle: ['speaker', 'Play', 'Play this step aloud'],
}

let unsubscribePause: (() => void) | null = null

/** Pause/Resume for the spoken step; when nothing is playing it replays the step. */
function pauseButton(s: Session, step: Step): HTMLButtonElement | null {
  const speaker = getSpeaker()
  if (!speaker) return null
  const b = h('button', { type: 'button', class: 'pause' })
  const render = (state: SpeechState) => {
    const [iconName, label, aria] = PAUSE_LABELS[state]
    b.replaceChildren(icon(iconName, 26), label)
    b.setAttribute('aria-label', aria)
    b.setAttribute('aria-pressed', String(state === 'paused'))
  }
  b.addEventListener('click', () => {
    if (speaker.current === 'idle') speaker.speak(spokenStep(s, step))
    else speaker.toggle()
  })
  unsubscribePause?.()
  unsubscribePause = speaker.onChange(render)
  render(speaker.current)
  return b
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
    h('div', { class: 'stepbar', 'aria-hidden': 'true' }, h('span', { style: `width:${(((s.stepIndex + 1) / total) * 100).toFixed(1)}%` })),
    h('h1', {}, step.title),
    h('p', { class: 'instruction' }, step.instruction),
    ...step.region_ids.map((id) => mixCard(s, id)),
    h('p', { class: 'tip' }, step.technique_tip),
    h(
      'div',
      { class: 'row' },
      speechAvailable() ? h('button', { type: 'button', onclick: () => speak(spokenStep(s, step)) }, icon('speaker'), 'Repeat') : null,
      h('button', { type: 'button', onclick: () => ask.classList.toggle('hidden') }, icon('chat'), 'Ask a question'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', onclick: () => { stopSpeaking(); allowSleep(); onExit() } }, icon('close'), 'Exit'),
    ),
    ask,
    h(
      'div',
      { class: 'nav' },
      h('button', { type: 'button', disabled: s.stepIndex === 0, onclick: () => go(-1) }, h('span', { class: 'wide-only' }, icon('arrowLeft', 26)), 'Back'),
      pauseButton(s, step),
      h('button', { type: 'button', class: 'primary', onclick: () => go(1) }, s.stepIndex === total - 1 ? 'Finish' : 'Next', h('span', { class: 'wide-only' }, icon(s.stepIndex === total - 1 ? 'flag' : 'arrowRight', 26))),
    ),
  )
}

/** Paint mode: show the current step and read it aloud. */
export function showStep(s: Session, onExit: () => void): void {
  mount(stepScreen(s, onExit))
  speak(spokenStep(s, s.plan!.steps[s.stepIndex]))
}

function doneScreen(s: Session, onExit: () => void): HTMLElement {
  return h(
    'div',
    { class: 'paint done' },
    heroArt(),
    h('h1', {}, 'Done. Step back and look.'),
    h('p', {}, 'Squint at the scene and your painting side by side. If one area jumps out, go back to its step and use the test-dab buttons.'),
    h('button', { type: 'button', class: 'big full', onclick: () => { s.stepIndex = s.plan!.steps.length - 1; showStep(s, onExit) } }, 'Back to the last step'),
    h('button', { type: 'button', class: 'primary big full', style: 'margin-top:12px', onclick: onExit }, 'Back to your colors'),
  )
}

/** The Plan page: the steps as a timeline with each step's colors, then "Start painting". */
export function renderPaintIntro(s: Session, onStart: () => void): HTMLElement {
  const plan = s.plan!
  const total = plan.steps.reduce((m, st) => m + st.est_minutes, 0)
  const hexOf = (id: number) => s.regions?.regions.find((r) => r.id === id)?.hex ?? '#888888'
  const start = h('button', { type: 'button', class: 'go big grow' }, icon('play', 26), 'Start painting')
  start.addEventListener('click', async () => {
    // This tap unlocks audio and keeps the screen on for the whole session.
    unlock()
    await keepAwake()
    s.stepIndex = 0
    onStart()
  })
  return h(
    'div',
    {},
    pageTitle('brush', 'Your painting plan', 'var(--tint-yellow)'),
    sourceNote(s),
    h('p', { class: 'plan-stats' }, h('span', {}, icon('flag', 20), `${plan.steps.length} steps`), h('span', {}, icon('clock', 20), `about ${total} min`), h('span', {}, icon('speaker', 20), 'read aloud')),
    h(
      'ol',
      { class: 'timeline' },
      ...plan.steps.map((st) =>
        h(
          'li',
          {},
          h('span', { class: 'num' }, String(st.order)),
          h('span', { class: 'tl-body' }, h('strong', {}, st.title), h('span', { class: 'tl-dots' }, ...st.region_ids.map((id) => chip(hexOf(id), regionLabel(s.plan, id))))),
          h('span', { class: 'muted' }, `${st.est_minutes} min`),
        ),
      ),
    ),
    h('p', { class: 'muted' }, 'Each step is read aloud. Tap Next with a clean knuckle, and use the test-dab buttons whenever a mix looks off.'),
    actionBar(start),
  )
}
