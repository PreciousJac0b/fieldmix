/** Subject: a scene outdoors or a reference painting. Tapping a card moves on. */

import type { Mode } from '../api.ts'
import type { Session } from '../session.ts'
import { h } from './dom.ts'
import { artworkArt, icon, sceneArt } from './icons.ts'
import { page, pageTitle } from './layout.ts'

export function renderMode(s: Session, onPicked: () => void, onBack: () => void): HTMLElement {
  const card = (mode: Mode, art: SVGSVGElement, title: string, text: string) => {
    const b = h(
      'button',
      { type: 'button', class: 'subject', 'aria-pressed': String(s.setup.mode === mode) },
      art,
      h('span', { class: 'subject-text' }, h('strong', {}, title), h('span', {}, text)),
      h('span', { class: 'subject-go', 'aria-hidden': 'true' }, icon('arrowRight', 26)),
    )
    b.addEventListener('click', () => {
      s.setup.mode = mode
      s.plan = null
      onPicked()
    })
    return b
  }
  return page(
    'mode',
    onBack,
    pageTitle('brush', 'What are you painting today?', 'var(--tint-lilac)'),
    h('p', { class: 'lead' }, 'Pick one. Fieldmix plans the painting order differently for each.'),
    card('scene', sceneArt(), 'A scene outdoors', 'Plein air: the park, the beach, your street. Paint the view in front of you.'),
    card('artwork', artworkArt(), 'A reference painting', "Paint-and-sip or a class: copy the host's sample painting, or color in an outline canvas."),
  )
}
