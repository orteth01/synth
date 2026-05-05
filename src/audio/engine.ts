const WORKLET_URL = '/worklets/voice.worklet.js'
const PROCESSOR_NAME = 'voice'

export interface EngineLatency {
  baseMs: number
  outputMs: number
  totalMs: number
}

export class Engine {
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private started = false

  /** Create the context and load the worklet. Safe to call before any user gesture
   * — the context starts in 'suspended' state. Call start() on a user gesture to
   * actually produce audio. Pre-initializing eliminates the first-keypress cold-start. */
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
