import { Voice, type LfoDestination } from '../dsp/voice'
import type { Waveshape } from '../dsp/oscillator'
import { Lfo, type LfoShape } from '../dsp/lfo'

const MAX_VOICES = 8

type InMessage =
  | { type: 'noteOn'; voiceIndex: number; note: number; velocity: number }
  | { type: 'noteOff'; voiceIndex: number }
  | { type: 'allOff' }
  | { type: 'setWave'; osc: 0 | 1 | 2; wave: Waveshape }
  | { type: 'setLfoShape'; shape: LfoShape }
  | { type: 'setLfoDest'; dest: LfoDestination }

class VoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const oscParams = [0, 1, 2].flatMap((i) => [
      { name: `osc${i + 1}Coarse`, defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' as const },
      { name: `osc${i + 1}Fine`, defaultValue: 0, minValue: -50, maxValue: 50, automationRate: 'k-rate' as const },
      { name: `osc${i + 1}Level`, defaultValue: i === 0 ? 0.8 : 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' as const },
    ])
    return [
      { name: 'pitchBend', defaultValue: 0, minValue: -12, maxValue: 12, automationRate: 'k-rate' as const },
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
      { name: 'lfoModWheel', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' as const },
    ]
  }

  private voices: Voice[]
  private oscWaves: Waveshape[] = ['saw', 'saw', 'saw']
  private globalLfo = new Lfo(0xd4)
  private lfoDest: LfoDestination = 'off'

  private lfoBuf: Float32Array | null = null
  private lfoDepthBuf: Float32Array | null = null
  private lfoModWheelBuf: Float32Array | null = null
  private cutoffBuf: Float32Array | null = null
  private resonanceBuf: Float32Array | null = null
  private envAmountBuf: Float32Array | null = null

  constructor() {
    super()
    this.voices = []
    for (let i = 0; i < MAX_VOICES; i++) this.voices.push(new Voice(sampleRate, i))

    this.port.onmessage = (e: MessageEvent<InMessage>) => {
      const m = e.data
      if (m.type === 'noteOn') {
        const v = this.voices[m.voiceIndex]
        if (v) v.noteOn(m.note, m.velocity)
      } else if (m.type === 'noteOff') {
        const v = this.voices[m.voiceIndex]
        if (v) v.noteOff()
      } else if (m.type === 'allOff') {
        for (const v of this.voices) v.reset()
      } else if (m.type === 'setWave') {
        this.oscWaves[m.osc] = m.wave
        for (const v of this.voices) v.setOscWave(m.osc, m.wave)
      } else if (m.type === 'setLfoShape') {
        this.globalLfo.setShape(m.shape)
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

    if (!this.lfoBuf || this.lfoBuf.length !== N) {
      this.lfoBuf = new Float32Array(N)
      this.lfoDepthBuf = new Float32Array(N)
      this.lfoModWheelBuf = new Float32Array(N)
      this.cutoffBuf = new Float32Array(N)
      this.resonanceBuf = new Float32Array(N)
      this.envAmountBuf = new Float32Array(N)
    }
    const lfoBuf = this.lfoBuf
    const lfoDepthBuf = this.lfoDepthBuf!
    const lfoModWheelBuf = this.lfoModWheelBuf!
    const cutoffBuf = this.cutoffBuf!
    const resonanceBuf = this.resonanceBuf!
    const envAmountBuf = this.envAmountBuf!

    this.globalLfo.process(parameters.lfoRate[0], sampleRate, lfoBuf)
    expandParam(parameters.lfoDepth, lfoDepthBuf)
    expandParam(parameters.lfoModWheel, lfoModWheelBuf)
    for (let i = 0; i < N; i++) {
      const sum = lfoDepthBuf[i] + lfoModWheelBuf[i]
      lfoDepthBuf[i] = sum > 1 ? 1 : sum
    }

    expandParam(parameters.cutoff, cutoffBuf)
    expandParam(parameters.resonance, resonanceBuf)
    expandParam(parameters.fEnvAmount, envAmountBuf)

    const oscFactors = [
      Math.pow(2, (parameters.osc1Coarse[0] * 100 + parameters.osc1Fine[0]) / 1200),
      Math.pow(2, (parameters.osc2Coarse[0] * 100 + parameters.osc2Fine[0]) / 1200),
      Math.pow(2, (parameters.osc3Coarse[0] * 100 + parameters.osc3Fine[0]) / 1200),
    ]
    const oscLevels = [parameters.osc1Level[0], parameters.osc2Level[0], parameters.osc3Level[0]]
    const pitchBendMultiplier = Math.pow(2, parameters.pitchBend[0] / 12)

    const sharedParams = {
      oscFactors,
      oscLevels,
      ampAttack: parameters.attack[0],
      ampDecay: parameters.decay[0],
      ampSustain: parameters.sustain[0],
      ampRelease: parameters.release[0],
      filterAttack: parameters.fAttack[0],
      filterDecay: parameters.fDecay[0],
      filterSustain: parameters.fSustain[0],
      filterRelease: parameters.fRelease[0],
      filterEnvAmount: envAmountBuf,
      cutoff: cutoffBuf,
      resonance: resonanceBuf,
      pitchBendMultiplier,
      lfoBuf,
      lfoDepth: lfoDepthBuf,
      lfoDest: this.lfoDest,
    }

    ch.fill(0)
    for (const v of this.voices) v.process(sampleRate, sharedParams, ch)

    // Master soft-clip (per §4.5) — keeps the sum of voices from clipping ugly.
    for (let i = 0; i < N; i++) ch[i] = Math.tanh(ch[i])

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
