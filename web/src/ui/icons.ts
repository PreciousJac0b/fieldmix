/**
 * Hand-drawn inline SVG icons and illustrations (no icon library, nothing fetched, so
 * they work offline). Line icons use `currentColor`; illustrations use paint colors.
 */

const NS = 'http://www.w3.org/2000/svg'

/** 24 × 24 line icons, drawn with a 2 px round stroke in the current text color. */
const ICONS = {
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="M3 17l5-5 4 4 3-3 6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11.5" r="1.3" fill="currentColor"/><circle cx="10" cy="7.5" r="1.3" fill="currentColor"/><circle cx="14.6" cy="7.5" r="1.3" fill="currentColor"/>',
  brush: '<path d="M14.5 3.5l6 6-7.5 6-4.5-4.5z"/><path d="M8.5 11c-2.5 0-4 1.6-4 4 0 2-1 3-2.5 3.5 3.5 2 10 1.5 10-3.5"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
  compare: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 2v20M7 9l-2 3 2 3M17 9l2 3-2 3"/>',
  sparkles: '<path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z"/><path d="M19 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3.2"/>',
  settings: '<path d="M4 6h9M19 6h1M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="16" cy="6" r="2.3"/><circle cx="9" cy="12" r="2.3"/><circle cx="17" cy="18" r="2.3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  offline: '<path d="M3 3l18 18"/><path d="M8.5 16.3a5 5 0 0 1 7 0M5 12.8a10 10 0 0 1 4.7-2.6M19 12.8a10 10 0 0 0-2.5-1.8M2 9.3a15 15 0 0 1 4-2.6M22 9.3A15 15 0 0 0 10.5 5.6"/><circle cx="12" cy="20" r="1" fill="currentColor"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
  save: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  retake: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  flag: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  eyedropper: '<path d="M14 6.5l3.5 3.5M16.5 3.5a2.1 2.1 0 0 1 3 3l-2 2-3-3z"/><path d="M15.5 8.5L7 17l-3 1 1-3 8.5-8.5"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  fill: '<path d="M5 11l6-6 8 8-6 6z"/><path d="M5 11h14"/><path d="M20 16s1.5 1.8 1.5 3a1.5 1.5 0 0 1-3 0c0-1.2 1.5-3 1.5-3z" fill="currentColor"/>',
} as const

export type IconName = keyof typeof ICONS

function fromMarkup(markup: string): SVGSVGElement {
  const t = document.createElement('template')
  t.innerHTML = markup.trim()
  return t.content.firstElementChild as SVGSVGElement
}

/** A line icon. Decorative by default (aria-hidden); pass a label to make it announced. */
export function icon(name: IconName, size = 24, label?: string): SVGSVGElement {
  const el = fromMarkup(
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`,
  )
  if (label) {
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', label)
  } else el.setAttribute('aria-hidden', 'true')
  return el
}

/** Build an SVG element with attributes (for drawings that use painter-supplied colors). */
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: SVGElement[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  el.append(...children)
  return el
}

const SAFE_HEX = /^#[0-9a-f]{6}$/i
const safeHex = (hex: string): string => (SAFE_HEX.test(hex) ? hex : '#888888')

/** A paint tube lying on its side, body in the paint's color. */
export function tube(hex: string, width = 120): SVGSVGElement {
  const color = safeHex(hex)
  return svg(
    'svg',
    { class: 'tube', width, height: Math.round((width * 36) / 120), viewBox: '0 0 120 36', 'aria-hidden': 'true' },
    svg('rect', { x: 2, y: 4, width: 10, height: 28, rx: 2, fill: '#d6d6d6', stroke: '#000', 'stroke-width': 2.5 }),
    svg('path', { d: 'M12 6H84q8 0 10 6v12q-2 6-10 6H12z', fill: color, stroke: '#000', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    svg('path', { d: 'M18 12H80', stroke: '#fff', 'stroke-opacity': 0.55, 'stroke-width': 3, 'stroke-linecap': 'round' }),
    svg('rect', { x: 94, y: 12, width: 8, height: 12, fill: '#d6d6d6', stroke: '#000', 'stroke-width': 2.5 }),
    svg('rect', { x: 102, y: 8, width: 16, height: 20, rx: 3, fill: '#1a1a1a', stroke: '#000', 'stroke-width': 2.5 }),
  )
}

// Paint colors used by the illustrations (the student set's yellow, red, blue, plus greens).
const Y = '#f9d71c'
const R = '#d93a2b'
const B = '#243b8f'
const G = '#4f6b2a'
const G2 = '#86a85a'
const SKY = '#cfe5ff'
const WOOD = '#ecd3a6'

/** Home hero: an easel with a landscape in progress, a palette, a brush, and floating paint drops. */
export function heroArt(): SVGSVGElement {
  return fromMarkup(`
<svg class="art hero-art" viewBox="0 0 320 210" role="img" aria-label="An easel holding a landscape painting, with a palette and brush">
  <defs><clipPath id="hero-canvas"><rect x="62" y="18" width="156" height="112" rx="6"/></clipPath></defs>
  <circle cx="248" cy="62" r="52" fill="#fff3c2"/>
  <g stroke="#000" stroke-width="5" stroke-linecap="round">
    <path d="M100 128L74 200M180 128L206 200M140 128v66"/>
  </g>
  <g clip-path="url(#hero-canvas)">
    <rect x="62" y="18" width="156" height="112" fill="${SKY}"/>
    <circle cx="178" cy="50" r="15" fill="${Y}"/>
    <path d="M62 98Q100 64 138 92T218 84V130H62z" fill="${G2}"/>
    <path d="M62 112Q112 90 160 114T218 106V130H62z" fill="${G}"/>
    <path d="M150 18h68v40c-30 4-52-6-68-40z" fill="#fff" opacity=".25"/>
  </g>
  <rect x="62" y="18" width="156" height="112" rx="6" fill="none" stroke="#000" stroke-width="4"/>
  <rect x="78" y="126" width="124" height="9" rx="3" fill="${WOOD}" stroke="#000" stroke-width="3"/>
  <g class="bob" style="--d:0s"><path d="M30 46s9 10 9 17a9 9 0 0 1-18 0c0-7 9-17 9-17z" fill="${B}" stroke="#000" stroke-width="3"/></g>
  <g class="bob" style="--d:.6s"><path d="M282 128s8 9 8 15a8 8 0 0 1-16 0c0-6 8-15 8-15z" fill="${R}" stroke="#000" stroke-width="3"/></g>
  <g class="bob" style="--d:1.2s"><path d="M38 118s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z" fill="${Y}" stroke="#000" stroke-width="3"/></g>
  <g transform="translate(222 150) rotate(-8)">
    <path d="M4 20C2 6 30-2 58 4s34 22 22 32-22 4-30 10-6 12-22 10S6 34 4 20z" fill="${WOOD}" stroke="#000" stroke-width="3"/>
    <circle cx="24" cy="30" r="6" fill="#fff" stroke="#000" stroke-width="2.5"/>
    <circle cx="20" cy="15" r="5.5" fill="${Y}" stroke="#000" stroke-width="2"/>
    <circle cx="36" cy="10" r="5.5" fill="${R}" stroke="#000" stroke-width="2"/>
    <circle cx="52" cy="12" r="5.5" fill="${B}" stroke="#000" stroke-width="2"/>
    <circle cx="66" cy="22" r="5.5" fill="#f4f3ee" stroke="#000" stroke-width="2"/>
  </g>
  <g transform="translate(240 112) rotate(35)">
    <rect x="0" y="-3.5" width="54" height="7" rx="3.5" fill="#8a3b22" stroke="#000" stroke-width="2.5"/>
    <rect x="-12" y="-5" width="13" height="10" fill="#c9c9c9" stroke="#000" stroke-width="2.5"/>
    <path d="M-12-5c-8 0-14 3-17 5 3 2 9 5 17 5z" fill="${B}" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>
  </g>
</svg>`)
}

/** Subject card art: a sunny landscape with mountains and a tree. */
export function sceneArt(): SVGSVGElement {
  return fromMarkup(`
<svg class="art" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="160" height="100" fill="${SKY}"/>
  <circle cx="122" cy="28" r="13" fill="${Y}" stroke="#000" stroke-width="2.5"/>
  <path d="M-4 78L40 30l22 24 18-18 46 42z" fill="#6f86c9" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M40 30l-9 10 9 4 8-4 6 5z" fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/>
  <path d="M-4 82Q50 64 98 80T164 74V104H-4z" fill="${G2}" stroke="#000" stroke-width="2.5"/>
  <path d="M-4 92Q60 82 164 90V104H-4z" fill="${G}"/>
  <rect x="128" y="62" width="6" height="18" fill="#8a3b22" stroke="#000" stroke-width="2"/>
  <circle cx="131" cy="54" r="13" fill="${G}" stroke="#000" stroke-width="2.5"/>
</svg>`)
}

/** Subject card art: an easel with a bright sample painting, and a glass for the sip-and-paint. */
export function artworkArt(): SVGSVGElement {
  return fromMarkup(`
<svg class="art" viewBox="0 0 160 100" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
  <rect width="160" height="100" fill="#f1e9ff"/>
  <g stroke="#000" stroke-width="3.5" stroke-linecap="round"><path d="M58 76L46 100M102 76l12 24M80 76v20"/></g>
  <rect x="44" y="10" width="72" height="62" rx="4" fill="#fff" stroke="#000" stroke-width="3"/>
  <path d="M48 14h64v26H48z" fill="#ffb347"/>
  <path d="M48 40h64v14H48z" fill="${R}"/>
  <path d="M48 54h64v14H48z" fill="#7e1c2e"/>
  <circle cx="80" cy="40" r="11" fill="${Y}" stroke="#000" stroke-width="2"/>
  <path d="M48 54q16-8 32 0t32 0" fill="none" stroke="#000" stroke-width="2"/>
  <rect x="50" y="72" width="60" height="6" rx="2" fill="${WOOD}" stroke="#000" stroke-width="2.5"/>
  <path d="M132 50h16l-2 14a6 6 0 0 1-12 0z" fill="#9e1f5e" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M140 70v16M133 88h14" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M18 70s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" fill="${B}" stroke="#000" stroke-width="2.5"/>
</svg>`)
}

/** Medium tile art, each in a paint color: acrylic tube, watercolor drop, oil flask, gouache jar. */
export function mediumArt(medium: 'acrylic' | 'watercolor' | 'oil' | 'gouache'): SVGSVGElement {
  const art: Record<typeof medium, string> = {
    acrylic: `<rect x="17" y="3" width="10" height="7" rx="2" fill="#1a1a1a" stroke="#000" stroke-width="2"/><path d="M15 10h14l3 5v20l-3 3H15l-3-3V15z" fill="${B}" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/><path d="M12 36h20v4H12z" fill="#d6d6d6" stroke="#000" stroke-width="2"/><path d="M17 17v14" stroke="#fff" stroke-opacity=".6" stroke-width="2.5" stroke-linecap="round"/>`,
    watercolor: `<path d="M22 4s13 14 13 23a13 13 0 0 1-26 0C9 18 22 4 22 4z" fill="#2a7ab8" fill-opacity=".85" stroke="#000" stroke-width="2.5"/><path d="M15 27a7 7 0 0 0 5 7" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    oil: `<path d="M17 4h10M18 4v11L8 34a4 4 0 0 0 3.6 6h20.8a4 4 0 0 0 3.6-6L26 15V4" fill="none" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/><path d="M12.5 26h19l4.5 8a4 4 0 0 1-3.6 6H11.6a4 4 0 0 1-3.6-6z" fill="#c79a2e" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>`,
    gouache: `<rect x="9" y="8" width="26" height="8" rx="2" fill="#1a1a1a" stroke="#000" stroke-width="2"/><path d="M11 16h22v19a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4z" fill="${R}" stroke="#000" stroke-width="2.5"/><rect x="14" y="22" width="16" height="9" rx="1.5" fill="#fff" stroke="#000" stroke-width="1.5"/>`,
  }
  return fromMarkup(`<svg class="art medium-art" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">${art[medium]}</svg>`)
}

/** Clock pies for a time choice: one pie per started hour, each filled by its share of the hour. */
export function timeArt(minutes: number): SVGSVGElement {
  const pies = Math.ceil(minutes / 60)
  const out = svg('svg', { class: 'art', width: 40 * pies + 4 * (pies - 1), height: 40, viewBox: `0 0 ${40 * pies} 40`, 'aria-hidden': 'true' })
  for (let i = 0; i < pies; i++) {
    const frac = Math.min(1, (minutes - i * 60) / 60)
    const cx = 20 + i * 40
    out.append(svg('circle', { cx, cy: 20, r: 17, fill: '#fff', stroke: '#000', 'stroke-width': 3 }))
    if (frac >= 1) out.append(svg('circle', { cx, cy: 20, r: 14, fill: Y }))
    else {
      const a = frac * 2 * Math.PI
      const [x, y] = [cx + 14 * Math.sin(a), 20 - 14 * Math.cos(a)]
      out.append(svg('path', { d: `M${cx} 20V6A14 14 0 ${frac > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}z`, fill: Y }))
    }
    out.append(svg('path', { d: `M${cx} 20V9M${cx} 20l6 4`, stroke: '#000', 'stroke-width': 2.5, 'stroke-linecap': 'round', fill: 'none' }))
  }
  return out
}

/** Where paint blobs sit on the palette board (viewBox 0 0 320 170), in fill order. */
export const PALETTE_SLOTS: [number, number][] = (() => {
  const slots: [number, number][] = []
  const thumb: [number, number] = [96, 118]
  const ring = (rx: number, ry: number, n: number, start: number, end: number) => {
    for (let i = 0; i < n; i++) {
      const t = start + ((end - start) * i) / (n - 1)
      const p: [number, number] = [164 + rx * Math.cos(t), 86 + ry * Math.sin(t)]
      if (Math.hypot(p[0] - thumb[0], p[1] - thumb[1]) > 36) slots.push(p)
    }
  }
  ring(118, 52, 14, Math.PI * 0.95, Math.PI * 2.32)
  ring(64, 22, 8, Math.PI * 1.05, Math.PI * 2.25)
  return slots
})()

/** The artist's palette that fills with a blob of each chosen paint. */
export function paletteBoard(): { el: SVGSVGElement; update: (hexes: string[]) => void } {
  const blobs = svg('g')
  const el = svg(
    'svg',
    { class: 'art palette-board', viewBox: '0 0 320 170', role: 'img', 'aria-label': 'Your palette' },
    svg('path', {
      d: 'M160 8C252 8 316 44 312 92c-3 40-46 70-104 70-26 0-34-14-26-28 8-13 2-26-16-25-22 1-28 20-42 34-18 18-70 20-96-4C6 120 4 82 22 56 46 24 96 8 160 8z',
      fill: WOOD,
      stroke: '#000',
      'stroke-width': 4,
      'stroke-linejoin': 'round',
    }),
    svg('path', { d: 'M40 48C70 24 120 16 170 18', stroke: '#fff', 'stroke-opacity': 0.5, 'stroke-width': 5, 'stroke-linecap': 'round', fill: 'none' }),
    svg('circle', { cx: 96, cy: 118, r: 17, fill: '#fff', stroke: '#000', 'stroke-width': 4 }),
    blobs,
  )
  let shown: string[] = []
  const update = (hexes: string[]) => {
    blobs.replaceChildren()
    hexes.slice(0, PALETTE_SLOTS.length).forEach((hex, i) => {
      const [x, y] = PALETTE_SLOTS[i]
      const isNew = shown[i] !== hex
      // A slightly lumpy blob with a shine. The pop animates an inner group, because a
      // CSS transform would replace the outer group's translate.
      const blob = svg(
        'g',
        { class: isNew ? 'blob pop' : 'blob' },
        svg('path', { d: 'M-13 1c-1-8 6-13 13-13s14 4 13 12c0 8-7 12-14 12s-11-4-12-11z', fill: safeHex(hex), stroke: '#000', 'stroke-width': 2.5 }),
        svg('ellipse', { cx: -4, cy: -5, rx: 4, ry: 2.5, fill: '#fff', opacity: 0.6 }),
      )
      blobs.append(svg('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, blob))
    })
    shown = hexes
  }
  return { el, update }
}

/** The app mark: a palette with three paint dots. */
export function logoMark(size = 36): SVGSVGElement {
  return fromMarkup(`
<svg class="logo" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
  <path d="M24 4C12 4 4 12 4 23s8 21 19 21c3 0 4-2 4-4 0-1.5-1.5-2.5-1.5-4 0-2 1.6-3.5 3.5-3.5H34c6 0 10-4.5 10-10C44 12 35 4 24 4z" fill="${WOOD}" stroke="#000" stroke-width="3.5"/>
  <circle cx="14" cy="22" r="4" fill="${R}" stroke="#000" stroke-width="2"/>
  <circle cx="19" cy="12.5" r="4" fill="${Y}" stroke="#000" stroke-width="2"/>
  <circle cx="30" cy="12.5" r="4" fill="${B}" stroke="#000" stroke-width="2"/>
</svg>`)
}
