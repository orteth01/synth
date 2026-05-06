import { describe, it, expect } from 'vitest'
import { Lfo } from './lfo'

const SR = 48000

function render(lfo: Lfo, rateHz: number, samples: number): Float32Array {
  const out = new Float32Array(samples)
  lfo.process(rateHz, SR, out)
  return out
}

describe('Lfo', () => {
  it('sine shape stays in [-1, 1] and visits both extremes', () => {
    const lfo = new Lfo()
    lfo.setShape('sine')
    const out = render(lfo, 5, SR)
    let min = Infinity
    let max = -Infinity
    for (const v of out) {
      expect(Math.abs(v)).toBeLessThanOrEqual(1)
      if (v < min) min = v
      if (v > max) max = v
    }
    expect(min).toBeLessThan(-0.99)
    expect(max).toBeGreaterThan(0.99)
  })

  it('triangle shape is exactly bounded by ±1', () => {
    const lfo = new Lfo()
    lfo.setShape('triangle')
    const out = render(lfo, 5, SR)
    for (const v of out) expect(Math.abs(v)).toBeLessThanOrEqual(1.0001)
  })

  it('square shape is only ±1', () => {
    const lfo = new Lfo()
    lfo.setShape('square')
    const out = render(lfo, 5, SR)
    for (const v of out) expect(Math.abs(v)).toBe(1)
  })

  it('sample-and-hold holds value across cycles', () => {
    const lfo = new Lfo(42)
    lfo.setShape('sh')
    const rate = 5
    const out = render(lfo, rate, SR)
    // Across one period (~9600 samples), value should be constant. Count
    // distinct values across 1 second at 5 Hz — should be exactly 5 (one per
    // wrap) plus the initial held value.
    const distinct = new Set<number>()
    for (const v of out) distinct.add(v)
    expect(distinct.size).toBeGreaterThanOrEqual(5)
    expect(distinct.size).toBeLessThanOrEqual(7)
  })

  it('rate controls cycle frequency (sine)', () => {
    const lfo = new Lfo()
    lfo.setShape('sine')
    const out = render(lfo, 5, SR) // expect 5 cycles in 1 second
    let crossings = 0
    for (let i = 1; i < out.length; i++) {
      if (out[i - 1] < 0 && out[i] >= 0) crossings++
    }
    expect(crossings).toBeGreaterThanOrEqual(4)
    expect(crossings).toBeLessThanOrEqual(6)
  })
})
