import { Oscillator, type Waveshape } from './oscillator'
import { Adsr } from './adsr'
import { LadderFilter } from './ladder'
import { DriftLfo } from './drift'

export type LfoDestination = 'off' | 'pitch' | 'cutoff' | 'amp'

const NUM_OSCS = 3
const DRIFT_DEPTH_CENTS = 2
const CENTS_TO_FREQ_LINEAR = Math.LN2 / 1200
const FILTER_ENV_OCTAVE_RANGE = 5
const LFO_PITCH_RANGE_CENTS = 100
const LFO_CUTOFF_RANGE_OCT = 2
const LFO_AMP_RANGE = 0.5

export interface VoiceParams {
  oscFactors: ReadonlyArray<number>
  oscLevels: ReadonlyArray<number>
  ampAttack: number
  ampDecay: number
  ampSustain: number
  ampRelease: number
  filterAttack: number
  filterDecay: number
  filterSustain: number
  filterRelease: number
  filterEnvAmount: Float32Array
  cutoff: Float32Array
  resonance: Float32Array
  pitchBendMultiplier: number
  lfoBuf: Float32Array
  lfoDepth: Float32Array
  lfoDest: LfoDestination
}

export class Voice {
  readonly index: number
  midiNote = 60
  velocity = 1
  active = false
  released = false

  private oscs: [Oscillator, Oscillator, Oscillator] = [
    new Oscillator(),
    new Oscillator(),
    new Oscillator(),
  ]
  private drifts: [DriftLfo, DriftLfo, DriftLfo]
  private filter: LadderFilter
  private ampAdsr: Adsr
  private filterAdsr: Adsr

  private freqBuf: Float32Array | null = null
  private driftBuf: Float32Array | null = null
  private oscBuf: Float32Array | null = null
  private mixBuf: Float32Array | null = null
  private filterEnvBuf: Float32Array | null = null
  private cutoffMod: Float32Array | null = null
  private envBuf: Float32Array | null = null

  constructor(sampleRate: number, index: number) {
    this.index = index
    const baseSeeds = [0xa1, 0xb2, 0xc3]
    this.drifts = [
      new DriftLfo(sampleRate, baseSeeds[0] ^ ((index + 1) << 8)),
      new DriftLfo(sampleRate, baseSeeds[1] ^ ((index + 1) << 8)),
      new DriftLfo(sampleRate, baseSeeds[2] ^ ((index + 1) << 8)),
    ]
    this.filter = new LadderFilter(sampleRate)
    this.ampAdsr = new Adsr(sampleRate)
    this.filterAdsr = new Adsr(sampleRate)
  }

  setOscWave(idx: 0 | 1 | 2, wave: Waveshape): void {
    this.oscs[idx].setWaveshape(wave)
  }

  noteOn(midiNote: number, velocity: number): void {
    this.midiNote = midiNote
    this.velocity = velocity
    this.ampAdsr.noteOn()
    this.filterAdsr.noteOn()
    this.active = true
    this.released = false
  }

  noteOff(): void {
    this.ampAdsr.noteOff()
    this.filterAdsr.noteOff()
    this.released = true
  }

  /** Render and accumulate into `out`. Returns true if voice is still producing audio. */
  process(sampleRate: number, p: VoiceParams, out: Float32Array): boolean {
    if (!this.active) return false

    const N = out.length
    if (!this.freqBuf || this.freqBuf.length !== N) {
      this.freqBuf = new Float32Array(N)
      this.driftBuf = new Float32Array(N)
      this.oscBuf = new Float32Array(N)
      this.mixBuf = new Float32Array(N)
      this.filterEnvBuf = new Float32Array(N)
      this.cutoffMod = new Float32Array(N)
      this.envBuf = new Float32Array(N)
    }
    const freqBuf = this.freqBuf
    const driftBuf = this.driftBuf!
    const oscBuf = this.oscBuf!
    const mixBuf = this.mixBuf!
    const filterEnvBuf = this.filterEnvBuf!
    const cutoffMod = this.cutoffMod!
    const envBuf = this.envBuf!

    const baseFreq = 440 * Math.pow(2, (this.midiNote - 69) / 12) * p.pitchBendMultiplier
    const dest = p.lfoDest
    const lfoBuf = p.lfoBuf
    const lfoDepth = p.lfoDepth

    mixBuf.fill(0)
    for (let n = 0; n < NUM_OSCS; n++) {
      const level = p.oscLevels[n]
      if (level <= 0) continue
      const oscBaseFreq = baseFreq * p.oscFactors[n]

      this.drifts[n].process(driftBuf, DRIFT_DEPTH_CENTS)
      if (dest === 'pitch') {
        for (let i = 0; i < N; i++) {
          const cents = driftBuf[i] + lfoBuf[i] * lfoDepth[i] * LFO_PITCH_RANGE_CENTS
          freqBuf[i] = oscBaseFreq * (1 + cents * CENTS_TO_FREQ_LINEAR)
        }
      } else {
        for (let i = 0; i < N; i++) {
          freqBuf[i] = oscBaseFreq * (1 + driftBuf[i] * CENTS_TO_FREQ_LINEAR)
        }
      }

      this.oscs[n].process(freqBuf, sampleRate, oscBuf)
      for (let i = 0; i < N; i++) mixBuf[i] += oscBuf[i] * level
    }

    // Pre-filter saturation per §4.2 — write into oscBuf (the filter's input).
    for (let i = 0; i < N; i++) oscBuf[i] = Math.tanh(mixBuf[i])

    this.filterAdsr.process(
      {
        attackS: p.filterAttack,
        decayS: p.filterDecay,
        sustain: p.filterSustain,
        releaseS: p.filterRelease,
      },
      filterEnvBuf,
    )
    if (dest === 'cutoff') {
      for (let i = 0; i < N; i++) {
        const oct =
          p.filterEnvAmount[i] * FILTER_ENV_OCTAVE_RANGE * filterEnvBuf[i] +
          lfoBuf[i] * lfoDepth[i] * LFO_CUTOFF_RANGE_OCT
        cutoffMod[i] = p.cutoff[i] * Math.pow(2, oct)
      }
    } else {
      for (let i = 0; i < N; i++) {
        cutoffMod[i] =
          p.cutoff[i] * Math.pow(2, p.filterEnvAmount[i] * FILTER_ENV_OCTAVE_RANGE * filterEnvBuf[i])
      }
    }

    this.filter.process(oscBuf, cutoffMod, p.resonance, oscBuf)

    this.ampAdsr.process(
      {
        attackS: p.ampAttack,
        decayS: p.ampDecay,
        sustain: p.ampSustain,
        releaseS: p.ampRelease,
      },
      envBuf,
    )
    const v = this.velocity
    if (dest === 'amp') {
      for (let i = 0; i < N; i++) {
        out[i] += oscBuf[i] * envBuf[i] * v * (1 + lfoBuf[i] * lfoDepth[i] * LFO_AMP_RANGE)
      }
    } else {
      for (let i = 0; i < N; i++) {
        out[i] += oscBuf[i] * envBuf[i] * v
      }
    }

    if (!this.ampAdsr.isActive()) {
      this.active = false
      this.released = false
    }
    return this.active
  }

  reset(): void {
    this.active = false
    this.released = false
    this.ampAdsr.reset()
    this.filterAdsr.reset()
    this.oscs[0].reset()
    this.oscs[1].reset()
    this.oscs[2].reset()
    this.filter.reset()
  }
}
