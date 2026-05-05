const WORKLET_URL = '/worklets/test-tone.js'
const PROCESSOR_NAME = 'test-tone'

export class Engine {
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null

  async init() {
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

  setToneGain(gain: number) {
    const param = this.node?.parameters.get('gain')
    if (!param || !this.ctx) return
    param.setTargetAtTime(gain, this.ctx.currentTime, 0.01)
  }

  dispose() {
    this.node?.disconnect()
    this.node = null
    void this.ctx?.close()
    this.ctx = null
  }
}
