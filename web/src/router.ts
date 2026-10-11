/**
 * Pages and their order. Each page has its own URL hash so Android's back button moves
 * between pages instead of leaving the app. Pure functions only; main.ts wires them to
 * the History API.
 */

export type Route = 'home' | 'mode' | 'setup' | 'paints' | 'map' | 'plan' | 'paint' | 'settings'

const ROUTES: Route[] = ['home', 'mode', 'setup', 'paints', 'map', 'plan', 'paint', 'settings']

/** The numbered steps shown in the progress bar (home and settings have none). */
export const STEPS: { route: Route; label: string }[] = [
  { route: 'mode', label: 'Subject' },
  { route: 'setup', label: 'Session' },
  { route: 'paints', label: 'Paints' },
  { route: 'map', label: 'Colors' },
  { route: 'plan', label: 'Paint' },
]

/** Where the in-page Back button leads from each page. */
export const PREVIOUS: Record<Route, Route> = {
  home: 'home',
  mode: 'home',
  setup: 'mode',
  paints: 'setup',
  map: 'paints',
  plan: 'map',
  paint: 'plan',
  settings: 'home',
}

/** 1-based step number for the progress bar, or 0 for pages outside the flow. */
export function stepNumber(route: Route): number {
  const r = route === 'paint' ? 'plan' : route
  return STEPS.findIndex((s) => s.route === r) + 1
}

export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '')
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'home'
}

export function routeHash(route: Route): string {
  return route === 'home' ? '#/' : `#/${route}`
}

export interface RouteState {
  hasPhoto: boolean
  hasPalette: boolean
  hasPlan: boolean
}

/**
 * The page to actually show for a requested one. Pages that need an earlier step's
 * result (a reload, or a stale link) fall back to the latest page that can be shown.
 */
export function resolveRoute(want: Route, st: RouteState): Route {
  switch (want) {
    case 'paints':
      return st.hasPhoto ? 'paints' : 'setup'
    case 'map':
      return !st.hasPhoto ? 'setup' : !st.hasPalette ? 'paints' : 'map'
    case 'plan':
    case 'paint':
      return st.hasPlan ? want : resolveRoute('map', st)
    default:
      return want
  }
}
