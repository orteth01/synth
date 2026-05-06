import { polyBlep } from './polyblep'

export type Waveshape = 'saw' | 'square' | 'triangle' | 'pulse'

const PULSE_DUTY = 0.15

export class Oscillator {
  private phase = 0
  private waveshape: Waveshape = 'saw'

  setWaveshape(w: Waveshape): void {
    this.waveshape = w
  }

  reset(): void {
    this.phase = 0
  }

  /** Render one block. Frequency is per-sample so per-sample modulation (drift,
   * pitch envelope, vibrato) can be applied without aliasing the polyBLEP window. */
  process(freq: Float32Array, sampleRate: number, out: Float32Array, gain: number = 1): void {
    let phase = this.phase
    const w = this.waveshape

    for (let i = 0; i < out.length; i++) {
      const dt = freq[i] / sampleRate
      let s: number

      switch (w) {
        case 'saw': {
          s = 2 * phase - 1 - polyBlep(phase, dt)
          break
        }
        case 'square': {
          const naive = phase < 0.5 ? 1 : -1
          const p2 = phase + 0.5 >= 1 ? phase - 0.5 : phase + 0.5
          s = naive + polyBlep(phase, dt) - polyBlep(p2, dt)
          break
        }
        case 'pulse': {
          const naive = phase < PULSE_DUTY ? 1 : -1
          const phaseAtFall = phase + (1 - PULSE_DUTY)
          const p2 = phaseAtFall >= 1 ? phaseAtFall - 1 : phaseAtFall
          s = naive + polyBlep(phase, dt) - polyBlep(p2, dt)
          // Center about zero — narrow pulse otherwise has a non-trivial DC offset.
          s -= 2 * PULSE_DUTY - 1
          break
        }
        case 'triangle': {
          // Naive triangle. Aliasing rolls off as 1/n² (vs 1/n for saw), so
          // the alias floor at musical pitches is acceptable without polyBLAMP.
          s = phase < 0.5 ? -1 + 4 * phase : 3 - 4 * phase
          break
        }
      }

      out[i] = s * gain
      phase += dt
      if (phase >= 1) phase -= 1
    }

    this.phase = phase
  }
}
