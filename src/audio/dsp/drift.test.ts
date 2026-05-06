import { describe, it, expect } from 'vitest'
import { DriftLfo } from './drift'

const SR = 48000

describe('DriftLfo', () => {
  it('output stays within ±depthCents', () => {
    const lfo = new DriftLfo(SR, 1)
    const N = 5 * SR
    const out = new Float32Array(N)
    lfo.process(out, 2)
    for (let i = 0; i < N; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(-2)
      expect(out[i]).toBeLessThanOrEqual(2)
      expect(Number.isFinite(out[i])).toBe(true)
    }
  })

  it('produces no fast jumps (slow drift only)', () => {
    const lfo = new DriftLfo(SR, 7)
    const N = 2 * SR
    const out = new Float32Array(N)
    lfo.process(out, 2)
    let maxStep = 0
    for (let i = 1; i < N; i++) {
      const d = Math.abs(out[i] - out[i - 1])
      if (d > maxStep) maxStep = d
    }
    // Fastest possible per-sample change at τ=1.5s with 4-cent excursion is
    // tiny — well under 0.001 cent per sample at 48 kHz.
    expect(maxStep).toBeLessThan(0.005)
  })

  it('different seeds produce different sequences', () => {
    const a = new DriftLfo(SR, 1)
    const b = new DriftLfo(SR, 2)
    const N = 2 * SR
    const aOut = new Float32Array(N)
    const bOut = new Float32Array(N)
    a.process(aOut, 2)
    b.process(bOut, 2)
    let diffSum = 0
    for (let i = 0; i < N; i++) diffSum += Math.abs(aOut[i] - bOut[i])
    expect(diffSum / N).toBeGreaterThan(0.1)
  })
})
