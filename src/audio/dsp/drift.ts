// Slow random pitch drift LFO. Picks a new random target every ~2–5 s and
// exponentially smooths toward it (τ ≈ 1.5 s). Output is in cents — the worklet
// scales by the configured drift depth. Each oscillator gets its own seed so
// the three drifts beat against each other, which is most of why the Minimoog
// sounds "alive" rather than sterile (plan §4.1).
export class DriftLfo {
  private current = 0
  private target = 0
  private samplesUntilNewTarget = 0
  private readonly smoothCoeff: number
  private readonly sampleRate: number
  private readonly rand: () => number

  constructor(sampleRate: number, seed: number) {
    this.sampleRate = sampleRate
    this.rand = mulberry32(seed >>> 0)
    // τ ≈ 1.5 s — slow enough to feel like analog drift, fast enough to
    // never sit still.
    this.smoothCoeff = 1 - Math.exp(-1 / (1.5 * sampleRate))
    this.target = this.rand() * 2 - 1
    this.scheduleNewTarget()
  }

  private scheduleNewTarget(): void {
    this.samplesUntilNewTarget = Math.floor(this.sampleRate * (2 + this.rand() * 3))
  }

  /** Fill `out` with values in [-depthCents, depthCents]. */
  process(out: Float32Array, depthCents: number): void {
    let cur = this.current
    let tgt = this.target
    let countdown = this.samplesUntilNewTarget
    const a = this.smoothCoeff

    for (let i = 0; i < out.length; i++) {
      if (countdown <= 0) {
        tgt = this.rand() * 2 - 1
        countdown = Math.floor(this.sampleRate * (2 + this.rand() * 3))
      }
      cur += (tgt - cur) * a
      out[i] = cur * depthCents
      countdown--
    }

    this.current = cur
    this.target = tgt
    this.samplesUntilNewTarget = countdown
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
