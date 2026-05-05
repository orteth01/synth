// Placeholder worklet: 440 Hz sine. Step 1 only — replaced by real DSP in step 2.
class TestToneProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 0, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'gain', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
    ]
  }

  constructor() {
    super()
    this.phase = 0
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0]
    if (!output || output.length === 0) return true
    const channel = output[0]
    const freq = parameters.frequency[0]
    const gainArr = parameters.gain
    const inc = (2 * Math.PI * freq) / sampleRate
    for (let i = 0; i < channel.length; i++) {
      const g = gainArr.length > 1 ? gainArr[i] : gainArr[0]
      channel[i] = Math.sin(this.phase) * g
      this.phase += inc
      if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI
    }
    return true
  }
}

registerProcessor('test-tone', TestToneProcessor)
