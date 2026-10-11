/** Home: what Fieldmix is, how it works in three steps, and "Let's go". */

import { health } from '../api.ts'
import { h } from './dom.ts'
import { heroArt, icon, logoMark, type IconName } from './icons.ts'
import { actionBar } from './layout.ts'

function howStep(iconName: IconName, tint: string, title: string, text: string): HTMLElement {
  return h('li', {}, h('span', { class: 'badge-icon', style: `--tint:${tint}` }, icon(iconName, 28)), h('span', {}, h('strong', {}, title), text))
}

function fact(iconName: IconName, text: string): HTMLElement {
  return h('li', {}, icon(iconName, 18), text)
}

/** Whether Gemma on the laptop is reachable, said plainly (the app works either way). */
function gemmaStatus(): HTMLElement {
  const pill = h('p', { class: 'pill', role: 'status' }, icon('laptop', 20), 'Looking for Gemma on your laptop…')
  void health().then((res) => {
    if (res?.model_ready) {
      pill.classList.add('on')
      pill.replaceChildren(h('span', { class: 'dot', 'aria-hidden': 'true' }), `Gemma is ready on your laptop (${res.model}).`)
    } else if (res) {
      pill.replaceChildren(icon('laptop', 20), "Laptop found, but Gemma isn't ready. Is Ollama running?")
    } else {
      pill.replaceChildren(icon('offline', 20), 'No laptop found. Mixing still works here, with a simpler built-in plan.')
    }
  })
  return pill
}

export function renderHome(onStart: () => void, onSettings: () => void): HTMLElement {
  return h(
    'div',
    { class: 'page home' },
    h(
      'header',
      { class: 'topbar' },
      logoMark(40),
      h('span', { class: 'wordmark' }, 'Fieldmix'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Settings', onclick: onSettings }, icon('settings', 26)),
    ),
    heroArt(),
    h('h1', { class: 'hero-title' }, 'Paint what you see, with ', h('span', { class: 'hl' }, 'the paints you have'), '.'),
    h(
      'p',
      { class: 'lead' },
      'Fieldmix turns a photo into a few simple color shapes, works out how to mix each one from your own paints, and talks you through the painting step by step, so your eyes stay on the canvas.',
    ),
    h('h2', {}, 'How it works'),
    h(
      'ol',
      { class: 'how' },
      howStep('camera', 'var(--tint-yellow)', 'Snap', "Photograph the view in front of you, or the host's painting at a paint-and-sip."),
      howStep('palette', 'var(--tint-red)', 'Mix', 'See which of your paints make each color, and how much of each.'),
      howStep('speaker', 'var(--tint-blue)', 'Paint', 'Follow spoken steps one at a time: phone down, brush up.'),
    ),
    h('ul', { class: 'facts' }, fact('palette', 'Color mixing runs on this phone'), fact('laptop', 'Gemma runs on your laptop'), fact('code', 'Free and open source')),
    gemmaStatus(),
    actionBar(h('button', { type: 'button', class: 'go big grow', onclick: onStart }, "Let's go", icon('arrowRight', 28))),
  )
}
