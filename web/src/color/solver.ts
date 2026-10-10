/** Promise wrapper around the recipe Web Worker. */

import type { Lab } from './lab.ts'
import type { Paint } from './paints.ts'
import type { TargetRecipes } from './recipes.ts'
import type { SolveRequest, SolveResponse } from './recipes.worker.ts'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (r: SolveResponse) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./recipes.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (ev: MessageEvent<SolveResponse>) => {
      pending.get(ev.data.requestId)?.(ev.data)
      pending.delete(ev.data.requestId)
    }
  }
  return worker
}

/** Solve recipes for many targets off the main thread. Resolves with results and worker time. */
export function solveInWorker(
  palette: Paint[],
  targets: { id: number | string; lab: Lab }[],
  n = 2,
): Promise<{ results: TargetRecipes[]; ms: number }> {
  const requestId = nextId++
  const req: SolveRequest = { requestId, palette, targets, n }
  return new Promise((resolve) => {
    pending.set(requestId, (r) => resolve({ results: r.results, ms: r.ms }))
    getWorker().postMessage(req)
  })
}
