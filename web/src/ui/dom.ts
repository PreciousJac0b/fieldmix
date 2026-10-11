/** Tiny DOM helpers (no UI framework). */

type Child = Node | string | number | null | undefined | false
type Props = Record<string, unknown> & { class?: string; style?: string }

/** Create an element: h('button', { class: 'big', onclick: fn }, 'Next'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener)
    } else if (key === 'class') {
      el.className = String(value)
    } else if (key in el && key !== 'style' && key !== 'list') {
      ;(el as unknown as Record<string, unknown>)[key] = value
    } else {
      el.setAttribute(key, value === true ? '' : String(value))
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c))
  return el
}

/** A color swatch chip. */
export function chip(hex: string, title = hex): HTMLSpanElement {
  return h('span', { class: 'chip', style: `background:${hex}`, title, role: 'img', 'aria-label': `color ${hex}` })
}

/** Replace the app root's content with one screen. */
export function mount(screen: Node): void {
  const root = document.getElementById('app')!
  root.replaceChildren(screen)
  window.scrollTo(0, 0)
}
