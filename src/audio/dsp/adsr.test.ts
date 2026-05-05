import { describe, it, expect } from 'vitest'
import { Adsr, type AdsrParams } from './adsr'

const SR = 48000

function render(adsr: Adsr, params: AdsrParams, samples: number): Float32Array {
  const out = new Float32Array(samples)
  adsr.process(params, out)
  return out
}

describe('Adsr', () => {
  const fast: AdsrParams = { attackS: 0.01, decayS: 0.05, sustain: 0.5, releaseS: 0.05 }

  it('starts idle at zero', () => {
    const a = new Adsr(SR)
    const out = render(a, fast, 100)
    for (const v of out) expect(v).toBe(0)
    expect(a.isActive()).toBe(false)
  })

  it('attack rises toward 1 and transitions to decay', () => {
    const a = new Adsr(SR)
    a.noteOn()
    // Render through the attack — 0.01s = 480 samples + slack
    render(a, fast, 1000)
    expect(a.currentStage).toBe('decay')
    // After full attack the level should be at or near 1 before decay starts working it down
    // After 1000 samples (~21ms) decay is partly done — level should be between sustain and 1.
    expect(a.currentLevel).toBeGreaterThan(fast.sustain)
    expect(a.currentLevel).toBeLessThanOrEqual(1)
  })

  it('decay settles to sustain level', () => {
    const a = new Adsr(SR)
    a.noteOn()
    // 0.5s — well past attack(10ms) + decay(50ms)
    render(a, fast, SR / 2)
    expect(a.currentStage).toBe('sustain')
    expect(a.currentLevel).toBeCloseTo(fast.sustain, 3)
  })

  it('holds sustain until noteOff', () => {
    const a = new Adsr(SR)
    a.noteOn()
    render(a, fast, SR / 2)
    const out = render(a, fast, 1000)
    for (const v of out) expect(v).toBeCloseTo(fast.sustain, 3)
  })

  it('release falls to zero and returns to idle', () => {
    const a = new Adsr(SR)
    a.noteOn()
    render(a, fast, SR / 2)
    a.noteOff()
    expect(a.currentStage).toBe('release')
    render(a, fast, SR) // 1s, well past 50ms release
    expect(a.currentStage).toBe('idle')
    expect(a.currentLevel).toBe(0)
  })

  it('retrigger from release ramps back up without resetting to zero', () => {
    const a = new Adsr(SR)
    a.noteOn()
    render(a, fast, SR / 2) // reach sustain
    a.noteOff()
    render(a, fast, 100) // partial release
    const partial = a.currentLevel
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(fast.sustain)

    a.noteOn()
    expect(a.currentStage).toBe('attack')
    // Next sample should rise from partial, not jump to 0
    const out = new Float32Array(1)
    a.process(fast, out)
    expect(out[0]).toBeGreaterThan(partial)
  })

  it('zero attack reaches sustain immediately', () => {
    const a = new Adsr(SR)
    const params: AdsrParams = { attackS: 0, decayS: 0, sustain: 0.7, releaseS: 0 }
    a.noteOn()
    const out = new Float32Array(8)
    a.process(params, out)
    expect(out[out.length - 1]).toBeCloseTo(0.7, 5)
  })

  it('produces no NaN or unbounded values across long runs', () => {
    const a = new Adsr(SR)
    a.noteOn()
    const out = new Float32Array(SR) // 1 s
    a.process(fast, out)
    for (let i = 0; i < out.length; i++) {
      expect(Number.isFinite(out[i])).toBe(true)
      expect(out[i]).toBeGreaterThanOrEqual(0)
      expect(out[i]).toBeLessThanOrEqual(1)
    }
  })
})
