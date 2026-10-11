/** Setup screen: mode, medium, minutes available, number of regions. */

import type { Medium, Mode } from '../api.ts'
import type { Session } from '../session.ts'
import { h } from './dom.ts'

function choiceGroup<T extends string | number>(options: [T, string][], current: T, onPick: (v: T) => void): HTMLElement {
  const group = h('div', { class: 'choices', role: 'group' })
  for (const [value, label] of options) {
    const b = h('button', { type: 'button', 'aria-pressed': String(value === current) }, label)
    b.addEventListener('click', () => {
      group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'))
      b.setAttribute('aria-pressed', 'true')
      onPick(value)
    })
    group.append(b)
  }
  return group
}

export function renderSetup(s: Session, onNext: () => void, onSettings: () => void): HTMLElement {
  const kValue = h('strong', {}, String(s.setup.k))
  const slider = h('input', { type: 'range', min: '4', max: '10', step: '1', value: String(s.setup.k), 'aria-label': 'Number of color regions' })
  slider.addEventListener('input', () => {
    s.setup.k = Number(slider.value)
    kValue.textContent = slider.value
  })

  return h(
    'div',
    {},
    h('div', { class: 'row' }, h('h1', {}, 'Fieldmix'), h('span', { class: 'spacer' }), h('button', { type: 'button', onclick: onSettings }, 'Settings')),
    h('p', { class: 'muted' }, 'Photograph what you want to paint, show Fieldmix your paints, and get mixes and a step-by-step plan you can listen to.'),
    h('h2', {}, 'What are you painting?'),
    choiceGroup<Mode>(
      [
        ['scene', 'A scene outdoors'],
        ['artwork', 'A reference painting'],
      ],
      s.setup.mode,
      (v) => (s.setup.mode = v),
    ),
    h('h2', {}, 'Medium'),
    choiceGroup<Medium>(
      [
        ['acrylic', 'Acrylic'],
        ['watercolor', 'Watercolor'],
        ['oil', 'Oil'],
        ['gouache', 'Gouache'],
      ],
      s.setup.medium,
      (v) => (s.setup.medium = v),
    ),
    h('h2', {}, 'Time you have'),
    choiceGroup<30 | 60 | 90>(
      [
        [30, '30 min'],
        [60, '60 min'],
        [90, '90 min'],
      ],
      s.setup.minutes,
      (v) => (s.setup.minutes = v),
    ),
    h('h2', {}, 'Color regions: ', kValue),
    slider,
    h('p', { class: 'muted' }, 'Fewer regions means simpler shapes and fewer mixes.'),
    h('button', { type: 'button', class: 'primary big full', onclick: onNext, style: 'margin-top:20px' }, 'Next: take a photo'),
  )
}
