import { PolyBlepSaw } from '../dsp/polyblep'
import { Adsr } from '../dsp/adsr'

type InMessage =
  | { type: 'noteOn' }
  | { type: 'noteOff' }

class VoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'attack', defaultValue: 0.005, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      { name: 'decay', defaultValue: 0.1, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      { name: 'sustain', defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.2, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
    ] as const
  }

  private saw = new PolyBlepSaw()
  private adsr = new Adsr(sampleRate)
  private envBuf: Float32Array | null = null

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<InMessage>) => {
      if (e.data.type === 'noteOn') this.adsr.noteOn()
      else if (e.data.type === 'noteOff') this.adsr.noteOff()
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

    this.saw.process(parameters.frequency[0], sampleRate, ch, 1)

    if (!this.envBuf || this.envBuf.length !== ch.length) {
      this.envBuf = new Float32Array(ch.length)
    }
    this.adsr.process(
      {
        attackS: parameters.attack[0],
        decayS: parameters.decay[0],
        sustain: parameters.sustain[0],
        releaseS: parameters.release[0],
      },
      this.envBuf,
    )
    for (let i = 0; i < ch.length; i++) ch[i] *= this.envBuf[i]

    return true
  }
}

registerProcessor('voice', VoiceProcessor)
