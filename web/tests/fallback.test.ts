import { describe, expect, it } from 'vitest'
import type { PlanOutput, PlanRequest } from '../src/api.ts'
import { fallbackPlan } from '../src/plan/fallback.ts'
import parity from '../../fixtures/planner_parity.json'

interface ParityCase {
  name: string
  request: PlanRequest
  expected: PlanOutput
}

const cases = parity as unknown as ParityCase[]

describe('fallbackPlan (TS port) matches the Python planner', () => {
  it('has the shared fixture', () => {
    expect(cases.length).toBeGreaterThanOrEqual(6)
  })

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(fallbackPlan(c.request)).toEqual(c.expected)
  })
})
