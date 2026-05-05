import { describe, it, expect } from 'vitest'
import { LadderFilter } from './ladder'

const SR = 48000

function constArr(value: number, length: number): Float32Array {
  const a = new Float32Array(length)
  a.fill(value)
  return a
}

function rms(buf: Float32Array): number {
  let s = 0
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / buf.length)
}

function makeSine(freq: number, length: number, sr: number, amplitude = 1): Float32Array {
  const out = new Float32Array(length)
  const inc = (2 * Math.PI * freq) / sr
  let phase = 0
  for (let i = 0; i < length; i++) {
    out[i] = Math.sin(phase) * amplitude
    phase += inc
  }
  return out
}

function magnitudeAt(filter: LadderFilter, testFreq: number, fc: number, r: number): number {
  filter.reset()
  const renderLen = Math.max(SR, Math.ceil(SR / Math.max(testFreq, 1)) * 50)
  const input = makeSine(testFreq, renderLen, SR, 0.5)
  const cutoff = constArr(fc, renderLen)
  const res = constArr(r, renderLen)
  const output = new Float32Array(renderLen)
  filter.process(input, cutoff, res, output)
  // Skip the first half (transient + filter ringing); measure on the second half.
  const tail = output.subarray(renderLen >> 1)
  return rms(tail) / rms(input.subarray(renderLen >> 1))
}

describe('LadderFilter', () => {
  it('passes near-DC content through unchanged', () => {
    const f = new LadderFilter(SR)
    const gain = magnitudeAt(f, 100, 5000, 0)
    expect(gain).toBeGreaterThan(0.9)
    expect(gain).toBeLessThan(1.1)
  })

  // A cascade of 4 identical 1-pole LPs is −12 dB at the per-stage cutoff
  // (each pole contributes −3 dB). The cascade's overall −3 dB point sits at
  // ~0.43·fc. This is canonical Moog-ladder behavior — keep the user-facing
  // "cutoff" knob naming the per-stage corner, document the offset elsewhere.
  it('attenuates by ~12 dB at the per-stage cutoff', () => {
    const f = new LadderFilter(SR)
    const fc = 1000
    const gain = magnitudeAt(f, fc, fc, 0)
    const db = 20 * Math.log10(gain)
    expect(db).toBeGreaterThan(-14)
    expect(db).toBeLessThan(-10)
  })

  it('has roughly 24 dB/octave slope above cutoff', () => {
    const f = new LadderFilter(SR)
    const fc = 1000
    const oneOctave = magnitudeAt(f, fc * 2, fc, 0)
    const twoOctaves = magnitudeAt(f, fc * 4, fc, 0)
    const slope1 = 20 * Math.log10(oneOctave)
    const slope2 = 20 * Math.log10(twoOctaves)
    // Each octave above cutoff should drop ~24 dB further.
    expect(slope2 - slope1).toBeLessThan(-18)
    expect(slope2 - slope1).toBeGreaterThan(-32)
  })

  it('self-oscillates at high resonance with no input', () => {
    const f = new LadderFilter(SR)
    const N = SR // 1 s
    const silent = new Float32Array(N)
    const cutoff = constArr(1000, N)
    const res = constArr(0.98, N)
    const out = new Float32Array(N)
    // Need a tiny perturbation to start oscillation. Use a single-sample impulse.
    silent[0] = 0.001
    f.process(silent, cutoff, res, out)
    // Tail (last 200ms) should still be oscillating.
    const tail = out.subarray(N - SR / 5)
    expect(rms(tail)).toBeGreaterThan(0.05)
  })

  it('does not self-oscillate at zero resonance', () => {
    const f = new LadderFilter(SR)
    const N = SR
    const silent = new Float32Array(N)
    silent[0] = 0.5 // big impulse
    const cutoff = constArr(1000, N)
    const res = constArr(0, N)
    const out = new Float32Array(N)
    f.process(silent, cutoff, res, out)
    const tail = out.subarray(N - SR / 5)
    expect(rms(tail)).toBeLessThan(1e-3)
  })

  it('remains stable across 60 s of fuzzed parameter automation', () => {
    const f = new LadderFilter(SR)
    const blockSize = 128
    const totalBlocks = Math.ceil((60 * SR) / blockSize)
    const input = new Float32Array(blockSize)
    const cutoff = new Float32Array(blockSize)
    const res = new Float32Array(blockSize)
    const out = new Float32Array(blockSize)

    let seed = 12345
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }

    let maxAbs = 0
    for (let b = 0; b < totalBlocks; b++) {
      for (let i = 0; i < blockSize; i++) {
        input[i] = (rand() - 0.5) * 2 // saw-ish noise in [-1, 1]
        cutoff[i] = 20 + rand() * 19980 // 20 Hz to 20 kHz
        res[i] = rand() // 0..1
      }
      f.process(input, cutoff, res, out)
      for (let i = 0; i < blockSize; i++) {
        const v = out[i]
        if (!Number.isFinite(v)) {
          throw new Error(`non-finite at block ${b} sample ${i}: ${v}`)
        }
        const a = Math.abs(v)
        if (a > maxAbs) maxAbs = a
      }
    }
    expect(maxAbs).toBeLessThan(2)
  })

  it('sweeping cutoff produces a continuous output (no zipper)', () => {
    const f = new LadderFilter(SR)
    const N = SR // 1 s sweep
    const input = makeSine(440, N, SR, 0.5)
    const cutoff = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const t = i / N
      // 200 Hz → 8 kHz exponential sweep
      cutoff[i] = 200 * Math.pow(40, t)
    }
    const res = constArr(0.3, N)
    const out = new Float32Array(N)
    f.process(input, cutoff, res, out)
    let maxStep = 0
    for (let i = 1; i < N; i++) {
      const d = Math.abs(out[i] - out[i - 1])
      if (d > maxStep) maxStep = d
    }
    // For a 440 Hz sine in a smoothly-swept filter, sample-to-sample deltas
    // should stay well below the signal level. Big jumps mean zipper.
    expect(maxStep).toBeLessThan(0.2)
  })
})
