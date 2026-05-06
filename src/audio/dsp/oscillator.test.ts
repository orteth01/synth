import { describe, it, expect } from 'vitest'
import { Oscillator } from './oscillator'

const SR = 48000

function constFreq(hz: number, n: number): Float32Array {
  const a = new Float32Array(n)
  a.fill(hz)
  return a
}

function rms(buf: Float32Array): number {
  let s = 0
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / buf.length)
}

function meanDc(buf: Float32Array): number {
  let s = 0
  for (let i = 0; i < buf.length; i++) s += buf[i]
  return s / buf.length
}

describe('Oscillator', () => {
  it('saw output stays within [-1, 1] and has near-zero DC', () => {
    const o = new Oscillator()
    o.setWaveshape('saw')
    const out = new Float32Array(SR)
    o.process(constFreq(440, SR), SR, out)
    for (let i = 0; i < out.length; i++) expect(Math.abs(out[i])).toBeLessThan(1.05)
    expect(Math.abs(meanDc(out))).toBeLessThan(0.01)
    expect(rms(out)).toBeGreaterThan(0.5)
  })

  it('square output stays within [-1, 1] and has near-zero DC', () => {
    const o = new Oscillator()
    o.setWaveshape('square')
    const out = new Float32Array(SR)
    o.process(constFreq(440, SR), SR, out)
    for (let i = 0; i < out.length; i++) expect(Math.abs(out[i])).toBeLessThan(1.05)
    expect(Math.abs(meanDc(out))).toBeLessThan(0.01)
    // Square should be louder than saw (more energy in lower harmonics)
    expect(rms(out)).toBeGreaterThan(0.8)
  })

  it('pulse is DC-compensated despite asymmetric duty', () => {
    const o = new Oscillator()
    o.setWaveshape('pulse')
    const out = new Float32Array(SR)
    o.process(constFreq(440, SR), SR, out)
    expect(Math.abs(meanDc(out))).toBeLessThan(0.02)
  })

  it('triangle is bounded and zero-DC', () => {
    const o = new Oscillator()
    o.setWaveshape('triangle')
    const out = new Float32Array(SR)
    o.process(constFreq(440, SR), SR, out)
    for (let i = 0; i < out.length; i++) expect(Math.abs(out[i])).toBeLessThanOrEqual(1)
    expect(Math.abs(meanDc(out))).toBeLessThan(0.01)
    // Triangle has lower RMS than saw/square (more energy at fundamental)
    expect(rms(out)).toBeGreaterThan(0.4)
    expect(rms(out)).toBeLessThan(0.7)
  })

  it('handles per-sample frequency modulation without producing NaN', () => {
    const o = new Oscillator()
    o.setWaveshape('saw')
    const N = SR
    const freq = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      freq[i] = 220 + 220 * (i / N) // sweep 220 → 440 Hz
    }
    const out = new Float32Array(N)
    o.process(freq, SR, out)
    for (let i = 0; i < N; i++) expect(Number.isFinite(out[i])).toBe(true)
  })
})
