const WORKLET_URL = '/worklets/voice.worklet.js'
const PROCESSOR_NAME = 'voice'

export class Engine {
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null

  async init(): Promise<void> {
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    await ctx.audioWorklet.addModule(WORKLET_URL)
    const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })
    node.connect(ctx.destination)
    if (ctx.state === 'suspended') await ctx.resume()
    this.ctx = ctx
    this.node = node
  }

  noteOn(midiNote: number): void {
    if (!this.node || !this.ctx) return
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12)
    this.node.parameters.get('frequency')?.setValueAtTime(freq, this.ctx.currentTime)
    this.node.port.postMessage({ type: 'noteOn' })
  }

  noteOff(): void {
    this.node?.port.postMessage({ type: 'noteOff' })
  }

  dispose(): void {
    this.node?.disconnect()
    this.node = null
    void this.ctx?.close()
    this.ctx = null
  }
}
