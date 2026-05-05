import { PolyBlepSaw } from '../dsp/polyblep'

type InMessage =
  | { type: 'noteOn' }
  | { type: 'noteOff' }

const ANTI_CLICK_TAU_S = 0.005

class VoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'frequency',
        defaultValue: 440,
        minValue: 20,
        maxValue: 20000,
        automationRate: 'k-rate',
      },
    ] as const
  }

  private saw = new PolyBlepSaw()
  private gateGain = 0
  private targetGain = 0
  private smoothCoeff: number

  constructor() {
    super()
    this.smoothCoeff = 1 - Math.exp(-1 / (ANTI_CLICK_TAU_S * sampleRate))
    this.port.onmessage = (e: MessageEvent<InMessage>) => {
      if (e.data.type === 'noteOn') this.targetGain = 1
      else if (e.data.type === 'noteOff') this.targetGain = 0
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
    const freq = parameters.frequency[0]

    this.saw.process(freq, sampleRate, ch, 1)

    const coeff = this.smoothCoeff
    const target = this.targetGain
    let g = this.gateGain
    for (let i = 0; i < ch.length; i++) {
      g += (target - g) * coeff
      ch[i] *= g
    }
    this.gateGain = g

    return true
  }
}

registerProcessor('voice', VoiceProcessor)
