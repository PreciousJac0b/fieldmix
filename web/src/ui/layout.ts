/** Shared page frame: top bar with Back and progress, page titles, the sticky action bar, and the loader. */

import { mixPaints } from '../color/mix.ts'
import { STEPS, stepNumber, type Route } from '../router.ts'
import { h } from './dom.ts'
import { icon, type IconName } from './icons.ts'

type Child = Node | string | null | false | undefined

/** Back button plus "Step n of 5" progress. */
export function topBar(route: Route, onBack: () => void): HTMLElement {
  const n = stepNumber(route)
  const back = h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Back', onclick: onBack }, icon('arrowLeft', 26))
  if (!n) return h('header', { class: 'topbar' }, back)
  return h(
    'header',
    { class: 'topbar' },
    back,
    h(
      'div',
      { class: 'progress' },
      h(
        'div',
        { class: 'bar', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': '1', 'aria-valuemax': String(STEPS.length), 'aria-valuenow': String(n) },
        ...STEPS.map((_, i) => h('span', { class: i < n ? 'on' : '' })),
      ),
      h('span', { class: 'progress-label' }, `Step ${n} of ${STEPS.length} · ${STEPS[n - 1].label}`),
    ),
  )
}

/** A page in the flow: top bar, then the content. */
export function page(route: Route, onBack: () => void, ...children: Child[]): HTMLElement {
  return h('div', { class: `page page-${route}` }, topBar(route, onBack), ...children)
}

/** A page title with an icon badge in a paint tint. */
export function pageTitle(iconName: IconName, title: string, tint = 'var(--tint-yellow)'): HTMLElement {
  return h('div', { class: 'title' }, h('span', { class: 'badge-icon', style: `--tint:${tint}` }, icon(iconName, 28)), h('h1', {}, title))
}

/** The bar that stays at the bottom of the screen with the page's main action. */
export function actionBar(...children: Child[]): HTMLElement {
  return h('div', { class: 'actionbar' }, ...children)
}

const BLUE = '#243b8f'
const YELLOW = '#f9d71c'

/** Full-page loader: blue and yellow blobs merge into the green the pigment model mixes from them. */
export function loadingScreen(text: string): HTMLElement {
  const green = mixPaints([
    { hex: BLUE, parts: 1 },
    { hex: YELLOW, parts: 1 },
  ]).hex
  return h(
    'div',
    { class: 'page loading' },
    h('div', { class: 'mixing', 'aria-hidden': 'true', style: `--a:${BLUE};--b:${YELLOW};--mix:${green}` }, h('span', { class: 'm-a' }), h('span', { class: 'm-b' }), h('span', { class: 'm-c' })),
    h('p', { class: 'loading-text', role: 'status' }, text),
    h('p', { class: 'muted' }, 'Ultramarine and cadmium yellow make this green in the same pigment model that works out your recipes.'),
  )
}
