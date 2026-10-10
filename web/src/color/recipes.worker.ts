/// <reference lib="webworker" />
/** Web Worker wrapper so the recipe search never blocks the UI thread. */

import type { Lab } from './lab.ts'
import type { Paint } from './paints.ts'
import { solveTargets, type TargetRecipes } from './recipes.ts'

export interface SolveRequest {
  requestId: number
  palette: Paint[]
  targets: { id: number | string; lab: Lab }[]
  n?: number
}

export interface SolveResponse {
  requestId: number
  results: TargetRecipes[]
  ms: number
}

self.onmessage = (ev: MessageEvent<SolveRequest>) => {
  const { requestId, palette, targets, n } = ev.data
  const start = performance.now()
  const results = solveTargets(palette, targets, n ?? 2)
  const response: SolveResponse = { requestId, results, ms: Math.round(performance.now() - start) }
  self.postMessage(response)
}
