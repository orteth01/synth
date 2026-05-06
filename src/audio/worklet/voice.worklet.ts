import { Oscillator, type Waveshape } from '../dsp/oscillator'
import { Adsr } from '../dsp/adsr'
import { LadderFilter } from '../dsp/ladder'
import { DriftLfo } from '../dsp/drift'
import { Lfo, type LfoShape } from '../dsp/lfo'

export type LfoDestination = 'off' | 'pitch' | 'cutoff' | 'amp'

type InMessage =
  | { type: 'noteOn' }
  | { type: 'noteOff' }
  | { type: 'setWave'; osc: 0 | 1 | 2; wave: Waveshape }
  | { type: 'setLfoShape'; shape: LfoShape }
  | { type: 'setLfoDest'; dest: LfoDestination }

const FILTER_ENV_OCTAVE_RANGE = 5
const NUM_OSCS = 3
const DRIFT_DEPTH_CENTS = 2
const CENTS_TO_FREQ_LINEAR = Math.LN2 / 1200
const LFO_PITCH_RANGE_CENTS = 100 // ±1 semitone at full depth
const LFO_CUTOFF_RANGE_OCT = 2 // ±2 octaves at full depth
const LFO_AMP_RANGE = 0.5 // ±50% gain at full depth

class VoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const oscParams = [0, 1, 2].flatMap((i) => [
      { name: `osc${i + 1}Coarse`, defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' as const },
      { name: `osc${i + 1}Fine`, defaultValue: 0, minValue: -50, maxValue: 50, automationRate: 'k-rate' as const },
      { name: `osc${i + 1}Level`, defaultValue: i === 0 ? 0.8 : 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' as const },
    ])
    return [
      { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000, automationRate: 'k-rate' as const },
      ...oscParams,
      { name: 'cutoff', defaultValue: 1000, minValue: 20, maxValue: 20000, automationRate: 'a-rate' as const },
      { name: 'resonance', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' as const },
      { name: 'attack', defaultValue: 0.005, minValue: 0, maxValue: 5, automationRate: 'k-rate' as const },
      { name: 'decay', defaultValue: 0.15, minValue: 0, maxValue: 5, automationRate: 'k-rate' as const },
      { name: 'sustain', defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: 'k-rate' as const },
      { name: 'release', defaultValue: 0.2, minValue: 0, maxValue: 5, automationRate: 'k-rate' as const },
      { name: 'fAttack', defaultValue: 0.01, minValue: 0, maxValue: 5, automationRate: 'k-rate' as const },
      { name: 'fDecay', defaultValue: 0.4, minValue: 0, maxValue: 5, automationRate: 'k-rate' as const },
      { name: 'fSustain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' as const },
      { name: 'fRelease', defaultValue: 0.3, minValue: 0, maxValue: 5, automationRate: 'k-rate' as const },
      { name: 'fEnvAmount', defaultValue: 0.5, minValue: -1, maxValue: 1, automationRate: 'a-rate' as const },
      { name: 'lfoRate', defaultValue: 5, minValue: 0.05, maxValue: 20, automationRate: 'k-rate' as const },
      { name: 'lfoDepth', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' as const },
    ]
  }

  private oscs: Oscillator[] = [new Oscillator(), new Oscillator(), new Oscillator()]
  private drifts: DriftLfo[] = [
    new DriftLfo(sampleRate, 0xa1),
    new DriftLfo(sampleRate, 0xb2),
    new DriftLfo(sampleRate, 0xc3),
  ]
  private filter = new LadderFilter(sampleRate)
  private ampAdsr = new Adsr(sampleRate)
  private filterAdsr = new Adsr(sampleRate)
  private lfo = new Lfo(0xd4)
  private lfoDest: LfoDestination = 'off'

  private envBuf: Float32Array | null = null
  private filterEnvBuf: Float32Array | null = null
  private cutoffBuf: Float32Array | null = null
  private resonanceBuf: Float32Array | null = null
  private envAmountBuf: Float32Array | null = null
  private mixBuf: Float32Array | null = null
  private oscBuf: Float32Array | null = null
  private freqBuf: Float32Array | null = null
  private driftBuf: Float32Array | null = null
  private lfoBuf: Float32Array | null = null
  private lfoDepthBuf: Float32Array | null = null

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<InMessage>) => {
      const m = e.data
      if (m.type === 'noteOn') {
        this.ampAdsr.noteOn()
        this.filterAdsr.noteOn()
      } else if (m.type === 'noteOff') {
        this.ampAdsr.noteOff()
        this.filterAdsr.noteOff()
      } else if (m.type === 'setWave') {
        this.oscs[m.osc].setWaveshape(m.wave)
      } else if (m.type === 'setLfoShape') {
        this.lfo.setShape(m.shape)
      } else if (m.type === 'setLfoDest') {
        this.lfoDest = m.dest
      }
    }
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0]
    if (!output || output.length === 0) return true
    const ch = output[0]
    const N = ch.length

    if (!this.envBuf || this.envBuf.length !== N) {
      this.envBuf = new Float32Array(N)
      this.filterEnvBuf = new Float32Array(N)
      this.cutoffBuf = new Float32Array(N)
      this.resonanceBuf = new Float32Array(N)
      this.envAmountBuf = new Float32Array(N)
      this.mixBuf = new Float32Array(N)
      this.oscBuf = new Float32Array(N)
      this.freqBuf = new Float32Array(N)
      this.driftBuf = new Float32Array(N)
      this.lfoBuf = new Float32Array(N)
      this.lfoDepthBuf = new Float32Array(N)
    }
    const envBuf = this.envBuf
    const filterEnvBuf = this.filterEnvBuf!
    const cutoffBuf = this.cutoffBuf!
    const resonanceBuf = this.resonanceBuf!
    const envAmountBuf = this.envAmountBuf!
    const mixBuf = this.mixBuf!
    const oscBuf = this.oscBuf!
    const freqBuf = this.freqBuf!
    const driftBuf = this.driftBuf!
    const lfoBuf = this.lfoBuf!
    const lfoDepthBuf = this.lfoDepthBuf!

    this.lfo.process(parameters.lfoRate[0], sampleRate, lfoBuf)
    expandParam(parameters.lfoDepth, lfoDepthBuf)
    const dest = this.lfoDest
    const lfoActive = dest !== 'off'

    const baseFreq = parameters.frequency[0]
    mixBuf.fill(0)

    for (let n = 0; n < NUM_OSCS; n++) {
      const coarse = parameters[`osc${n + 1}Coarse`][0]
      const fine = parameters[`osc${n + 1}Fine`][0]
      const level = parameters[`osc${n + 1}Level`][0]
      if (level <= 0) continue

      const oscFactor = Math.pow(2, (coarse * 100 + fine) / 1200)
      const oscBaseFreq = baseFreq * oscFactor

      this.drifts[n].process(driftBuf, DRIFT_DEPTH_CENTS)
      if (lfoActive && dest === 'pitch') {
        for (let i = 0; i < N; i++) {
          const totalCents = driftBuf[i] + lfoBuf[i] * lfoDepthBuf[i] * LFO_PITCH_RANGE_CENTS
          freqBuf[i] = oscBaseFreq * (1 + totalCents * CENTS_TO_FREQ_LINEAR)
        }
      } else {
        for (let i = 0; i < N; i++) {
          freqBuf[i] = oscBaseFreq * (1 + driftBuf[i] * CENTS_TO_FREQ_LINEAR)
        }
      }

      this.oscs[n].process(freqBuf, sampleRate, oscBuf)
      for (let i = 0; i < N; i++) mixBuf[i] += oscBuf[i] * level
    }

    for (let i = 0; i < N; i++) ch[i] = Math.tanh(mixBuf[i])

    expandParam(parameters.cutoff, cutoffBuf)
    expandParam(parameters.resonance, resonanceBuf)
    expandParam(parameters.fEnvAmount, envAmountBuf)

    this.filterAdsr.process(
      {
        attackS: parameters.fAttack[0],
        decayS: parameters.fDecay[0],
        sustain: parameters.fSustain[0],
        releaseS: parameters.fRelease[0],
      },
      filterEnvBuf,
    )
    if (lfoActive && dest === 'cutoff') {
      for (let i = 0; i < N; i++) {
        const octaves =
          envAmountBuf[i] * FILTER_ENV_OCTAVE_RANGE * filterEnvBuf[i] +
          lfoBuf[i] * lfoDepthBuf[i] * LFO_CUTOFF_RANGE_OCT
        cutoffBuf[i] *= Math.pow(2, octaves)
      }
    } else {
      for (let i = 0; i < N; i++) {
        cutoffBuf[i] *= Math.pow(2, envAmountBuf[i] * FILTER_ENV_OCTAVE_RANGE * filterEnvBuf[i])
      }
    }

    this.filter.process(ch, cutoffBuf, resonanceBuf, ch)

    this.ampAdsr.process(
      {
        attackS: parameters.attack[0],
        decayS: parameters.decay[0],
        sustain: parameters.sustain[0],
        releaseS: parameters.release[0],
      },
      envBuf,
    )
    if (lfoActive && dest === 'amp') {
      for (let i = 0; i < N; i++) {
        ch[i] *= envBuf[i] * (1 + lfoBuf[i] * lfoDepthBuf[i] * LFO_AMP_RANGE)
      }
    } else {
      for (let i = 0; i < N; i++) ch[i] *= envBuf[i]
    }

    return true
  }
}

function expandParam(src: Float32Array, dst: Float32Array): void {
  if (src.length === dst.length) {
    dst.set(src)
  } else {
    dst.fill(src[0])
  }
}

registerProcessor('voice', VoiceProcessor)
