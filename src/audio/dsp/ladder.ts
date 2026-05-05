// Huovilainen-style nonlinear digital model of the Moog ladder filter.
// 4 cascaded one-pole LP stages with tanh nonlinearity, negative feedback from y4.
// Internally runs at 2× oversampling (per plan §4.3) — input is linearly interpolated,
// the filter advances twice per input sample, and the two outputs are averaged
// for decimation. Resonance ∈ [0, 1] maps to feedback k ∈ [0, 4.5]; the cascade's
// loop gain reaches unity at k = 4, so r ≥ 0.95 gives sustained self-oscillation.
//
// References: Huovilainen, "Non-linear digital implementation of the Moog ladder
// filter", DAFx 2004; Stilson & Smith, "Analyzing the Moog VCF with considerations
// for digital implementation", ICMC 1996.
export class LadderFilter {
  private y1 = 0
  private y2 = 0
  private y3 = 0
  private y4 = 0
  private prevInput = 0
  private readonly twoPiOverSr2: number
  private readonly maxCutoff: number

  constructor(sampleRate: number) {
    this.twoPiOverSr2 = (2 * Math.PI) / (sampleRate * 2)
    // 49% of base Nyquist; the 2× rate gives more headroom but we still cap.
    this.maxCutoff = sampleRate * 0.49
  }

  /** Process one block. cutoff in Hz, resonance in [0, 1]. Per-sample arrays. */
  process(
    input: Float32Array,
    cutoffHz: Float32Array,
    resonance: Float32Array,
    output: Float32Array,
  ): void {
    const c = this.twoPiOverSr2
    const maxFc = this.maxCutoff

    let y1 = this.y1
    let y2 = this.y2
    let y3 = this.y3
    let y4 = this.y4
    let prev = this.prevInput

    for (let i = 0; i < input.length; i++) {
      const fcRaw = cutoffHz[i]
      const fc = fcRaw < 20 ? 20 : fcRaw > maxFc ? maxFc : fcRaw
      const G = 1 - Math.exp(-c * fc)

      const rRaw = resonance[i]
      const r = rRaw < 0 ? 0 : rRaw > 1 ? 1 : rRaw
      const k = r * 4.5

      const x = input[i]
      const xMid = 0.5 * (prev + x)

      // Sub-step 1 (interpolated midpoint at 2× rate)
      let u = xMid - k * y4
      y1 += G * (Math.tanh(u) - Math.tanh(y1))
      y2 += G * (Math.tanh(y1) - Math.tanh(y2))
      y3 += G * (Math.tanh(y2) - Math.tanh(y3))
      y4 += G * (Math.tanh(y3) - Math.tanh(y4))
      const a = y4

      // Sub-step 2 (current sample at 2× rate)
      u = x - k * y4
      y1 += G * (Math.tanh(u) - Math.tanh(y1))
      y2 += G * (Math.tanh(y1) - Math.tanh(y2))
      y3 += G * (Math.tanh(y2) - Math.tanh(y3))
      y4 += G * (Math.tanh(y3) - Math.tanh(y4))
      const b = y4

      // 2-tap moving-average decimation. Crude but flat in passband; introduces
      // ~3 dB rolloff at base Nyquist. Acceptable for v1 — replace with a longer
      // halfband FIR if measurements show the rolloff is a problem.
      output[i] = 0.5 * (a + b)
      prev = x
    }

    this.y1 = y1
    this.y2 = y2
    this.y3 = y3
    this.y4 = y4
    this.prevInput = prev
  }

  reset(): void {
    this.y1 = 0
    this.y2 = 0
    this.y3 = 0
    this.y4 = 0
    this.prevInput = 0
  }
}
