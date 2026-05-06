const WORKLET_URL = '/worklets/voice.worklet.js'
const PROCESSOR_NAME = 'voice'

export interface EngineLatency {
  baseMs: number
  outputMs: number
  totalMs: number
}

export type Waveshape = 'saw' | 'square' | 'triangle' | 'pulse'
export type OscIndex = 0 | 1 | 2

export interface OscSettings {
  waveshape: Waveshape
  coarse: number
  fine: number
  level: number
}

export interface AmpEnvelope {
  attackS: number
  decayS: number
  sustain: number
  releaseS: number
}

export interface FilterSettings {
  cutoffHz: number
  resonance: number
}

export interface FilterEnvelope {
  attackS: number
  decayS: number
  sustain: number
  releaseS: number
  envAmount: number
}

const PARAM_SMOOTH_S = 0.005

export class Engine {
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private started = false

  async init(): Promise<void> {
    if (this.ctx) return
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    await ctx.audioWorklet.addModule(WORKLET_URL)
    const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })
    node.connect(ctx.destination)
    this.ctx = ctx
    this.node = node
  }

  async start(): Promise<void> {
    if (this.started) return
    if (!this.ctx) await this.init()
    if (this.ctx!.state === 'suspended') await this.ctx!.resume()
    this.started = true
  }

  isStarted(): boolean {
    return this.started
  }

  noteOn(midiNote: number): void {
    if (!this.node || !this.ctx) return
    if (!this.started) void this.start().catch(() => {})
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12)
    this.node.parameters.get('frequency')?.setValueAtTime(freq, this.ctx.currentTime)
    this.node.port.postMessage({ type: 'noteOn' })
  }

  noteOff(): void {
    this.node?.port.postMessage({ type: 'noteOff' })
  }

  setAmpEnvelope(env: AmpEnvelope): void {
    if (!this.node || !this.ctx) return
    const t = this.ctx.currentTime
    this.node.parameters.get('attack')?.setValueAtTime(env.attackS, t)
    this.node.parameters.get('decay')?.setValueAtTime(env.decayS, t)
    this.node.parameters.get('sustain')?.setValueAtTime(env.sustain, t)
    this.node.parameters.get('release')?.setValueAtTime(env.releaseS, t)
  }

  setOscillator(index: OscIndex, s: OscSettings): void {
    if (!this.node || !this.ctx) return
    const t = this.ctx.currentTime
    const i = index + 1
    this.node.parameters.get(`osc${i}Coarse`)?.setValueAtTime(s.coarse, t)
    this.node.parameters.get(`osc${i}Fine`)?.setValueAtTime(s.fine, t)
    this.node.parameters.get(`osc${i}Level`)?.setTargetAtTime(s.level, t, PARAM_SMOOTH_S)
    this.node.port.postMessage({ type: 'setWave', osc: index, wave: s.waveshape })
  }

  setFilter(f: FilterSettings): void {
    if (!this.node || !this.ctx) return
    const t = this.ctx.currentTime
    this.node.parameters.get('cutoff')?.setTargetAtTime(f.cutoffHz, t, PARAM_SMOOTH_S)
    this.node.parameters.get('resonance')?.setTargetAtTime(f.resonance, t, PARAM_SMOOTH_S)
  }

  setFilterEnvelope(env: FilterEnvelope): void {
    if (!this.node || !this.ctx) return
    const t = this.ctx.currentTime
    this.node.parameters.get('fAttack')?.setValueAtTime(env.attackS, t)
    this.node.parameters.get('fDecay')?.setValueAtTime(env.decayS, t)
    this.node.parameters.get('fSustain')?.setValueAtTime(env.sustain, t)
    this.node.parameters.get('fRelease')?.setValueAtTime(env.releaseS, t)
    this.node.parameters.get('fEnvAmount')?.setTargetAtTime(env.envAmount, t, PARAM_SMOOTH_S)
  }

  getLatency(): EngineLatency | null {
    if (!this.ctx) return null
    const base = (this.ctx.baseLatency ?? 0) * 1000
    const output = (this.ctx.outputLatency ?? 0) * 1000
    return { baseMs: base, outputMs: output, totalMs: base + output }
  }

  dispose(): void {
    this.node?.disconnect()
    this.node = null
    void this.ctx?.close()
    this.ctx = null
    this.started = false
  }
}
