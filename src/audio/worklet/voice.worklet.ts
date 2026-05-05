import { PolyBlepSaw } from '../dsp/polyblep'
import { Adsr } from '../dsp/adsr'
import { LadderFilter } from '../dsp/ladder'

type InMessage =
  | { type: 'noteOn' }
  | { type: 'noteOff' }

const FILTER_ENV_OCTAVE_RANGE = 5

class VoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'cutoff', defaultValue: 1000, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
      { name: 'resonance', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'attack', defaultValue: 0.005, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      { name: 'decay', defaultValue: 0.15, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      { name: 'sustain', defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.2, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      { name: 'fAttack', defaultValue: 0.01, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      { name: 'fDecay', defaultValue: 0.4, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      { name: 'fSustain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'fRelease', defaultValue: 0.3, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      { name: 'fEnvAmount', defaultValue: 0.5, minValue: -1, maxValue: 1, automationRate: 'a-rate' },
    ] as const
  }

  private saw = new PolyBlepSaw()
  private filter = new LadderFilter(sampleRate)
  private ampAdsr = new Adsr(sampleRate)
  private filterAdsr = new Adsr(sampleRate)
  private envBuf: Float32Array | null = null
  private filterEnvBuf: Float32Array | null = null
  private cutoffBuf: Float32Array | null = null
  private resonanceBuf: Float32Array | null = null
  private envAmountBuf: Float32Array | null = null

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<InMessage>) => {
      if (e.data.type === 'noteOn') {
        this.ampAdsr.noteOn()
        this.filterAdsr.noteOn()
      } else if (e.data.type === 'noteOff') {
        this.ampAdsr.noteOff()
        this.filterAdsr.noteOff()
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
    }
    const envBuf = this.envBuf
    const filterEnvBuf = this.filterEnvBuf!
    const cutoffBuf = this.cutoffBuf!
    const resonanceBuf = this.resonanceBuf!
    const envAmountBuf = this.envAmountBuf!

    this.saw.process(parameters.frequency[0], sampleRate, ch, 1)

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

    // Apply filter envelope to base cutoff in octave space.
    for (let i = 0; i < N; i++) {
      cutoffBuf[i] *= Math.pow(2, envAmountBuf[i] * FILTER_ENV_OCTAVE_RANGE * filterEnvBuf[i])
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
    for (let i = 0; i < N; i++) ch[i] *= envBuf[i]

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
