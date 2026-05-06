export type LfoShape = 'sine' | 'triangle' | 'square' | 'sh'

// Free-running modulation source. Output bipolar in [-1, 1]. Sample-and-hold
// resamples a new random value when the phase wraps.
export class Lfo {
  private phase = 0
  private shape: LfoShape = 'triangle'
  private shValue = 0
  private readonly rand: () => number

  constructor(seed: number = 0xfeed) {
    this.rand = mulberry32(seed >>> 0)
    this.shValue = this.rand() * 2 - 1
  }

  setShape(s: LfoShape): void {
    this.shape = s
  }

  reset(): void {
    this.phase = 0
  }

  process(rateHz: number, sampleRate: number, out: Float32Array): void {
    let phase = this.phase
    const dt = rateHz / sampleRate
    const shape = this.shape
    let shValue = this.shValue

    for (let i = 0; i < out.length; i++) {
      let v: number
      switch (shape) {
        case 'sine':
          v = Math.sin(2 * Math.PI * phase)
          break
        case 'triangle':
          v = phase < 0.5 ? -1 + 4 * phase : 3 - 4 * phase
          break
        case 'square':
          v = phase < 0.5 ? 1 : -1
          break
        case 'sh':
          v = shValue
          break
      }
      out[i] = v
      phase += dt
      if (phase >= 1) {
        phase -= 1
        if (shape === 'sh') shValue = this.rand() * 2 - 1
      }
    }

    this.phase = phase
    this.shValue = shValue
  }
}

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}
