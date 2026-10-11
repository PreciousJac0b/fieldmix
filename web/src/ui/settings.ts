/** Settings content: where the backend (Gemma on the laptop) lives. main.ts wraps it in the page frame. */

import { getBackendUrl, health, setBackendUrl } from '../api.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
import { pageTitle } from './layout.ts'

export function renderSettings(onBack: () => void): HTMLElement {
  const url = h('input', { type: 'url', value: getBackendUrl(), placeholder: 'http://192.168.1.20:8000 (empty = this page)', 'aria-label': 'Backend URL' })
  const status = h('p', { role: 'status' })
  const test = async () => {
    setBackendUrl(url.value)
    status.textContent = 'Checking…'
    const res = await health()
    status.textContent = res
      ? `Connected: ${res.provider} / ${res.model} — model ${res.model_ready ? 'ready' : 'NOT ready (is Ollama running?)'}`
      : 'Not reachable. Fieldmix will still work offline with a simpler built-in plan.'
  }
  return h(
    'div',
    {},
    pageTitle('settings', 'Settings', 'var(--tint-blue)'),
    h('h2', {}, 'Laptop address'),
    h('p', { class: 'muted' }, 'Leave empty when this page was opened from the laptop (the usual case). Set it only if the page came from somewhere else on the same Wi-Fi.'),
    url,
    h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { type: 'button', class: 'primary', onclick: test }, icon('laptop'), 'Save and test')),
    status,
    h('h2', {}, 'Keeping the screen on'),
    h(
      'p',
      { class: 'muted' },
      "Over plain http on Wi-Fi, Chrome blocks the screen wake lock. Fieldmix falls back to a silent video. For the real wake lock, open chrome://flags/#unsafely-treat-insecure-origin-as-secure on this phone, add this page's address, and relaunch Chrome.",
    ),
    h('button', { type: 'button', class: 'big full', style: 'margin-top:16px', onclick: onBack }, 'Done'),
  )
}
