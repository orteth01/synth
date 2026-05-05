export function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt
    return x + x - x * x - 1
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt
    return x * x + x + x + 1
  }
  return 0
}

export class PolyBlepSaw {
  private phase = 0

  process(frequency: number, sampleRate: number, out: Float32Array, gain = 1): void {
    const dt = frequency / sampleRate
    let phase = this.phase
    for (let i = 0; i < out.length; i++) {
      const naive = 2 * phase - 1
      out[i] = (naive - polyBlep(phase, dt)) * gain
      phase += dt
      if (phase >= 1) phase -= 1
    }
    this.phase = phase
  }

  reset(): void {
    this.phase = 0
  }
}
