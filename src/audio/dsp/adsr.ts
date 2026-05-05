export interface AdsrParams {
  attackS: number
  decayS: number
  sustain: number
  releaseS: number
}

type Stage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release'

// Per-sample multiplier α for `level += (target - level) * α` such that the level
// closes to within 1% of the target after `timeS` seconds. Plan §4.4: RC-asymptotic.
function timeToCoeff(timeS: number, sampleRate: number): number {
  if (timeS <= 0) return 1
  return 1 - Math.exp(Math.log(0.01) / (timeS * sampleRate))
}

const ATTACK_DONE = 0.999
const DECAY_DONE_DELTA = 0.001
const RELEASE_DONE = 1e-4

export class Adsr {
  private level = 0
  private stage: Stage = 'idle'
  private readonly sampleRate: number

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate
  }

  noteOn(): void {
    this.stage = 'attack'
  }

  noteOff(): void {
    if (this.stage !== 'idle') this.stage = 'release'
  }

  reset(): void {
    this.level = 0
    this.stage = 'idle'
  }

  isActive(): boolean {
    return this.stage !== 'idle'
  }

  get currentLevel(): number {
    return this.level
  }

  get currentStage(): Stage {
    return this.stage
  }

  process(p: AdsrParams, out: Float32Array): void {
    const sr = this.sampleRate
    const aCoeff = timeToCoeff(p.attackS, sr)
    const dCoeff = timeToCoeff(p.decayS, sr)
    const rCoeff = timeToCoeff(p.releaseS, sr)
    const sustain = p.sustain < 0 ? 0 : p.sustain > 1 ? 1 : p.sustain

    let level = this.level
    let stage = this.stage

    for (let i = 0; i < out.length; i++) {
      switch (stage) {
        case 'idle':
          level = 0
          break
        case 'attack':
          level += (1 - level) * aCoeff
          if (level >= ATTACK_DONE) {
            level = 1
            stage = 'decay'
          }
          break
        case 'decay':
          level += (sustain - level) * dCoeff
          if (Math.abs(level - sustain) < DECAY_DONE_DELTA) {
            level = sustain
            stage = 'sustain'
          }
          break
        case 'sustain':
          level = sustain
          break
        case 'release':
          level += -level * rCoeff
          if (level < RELEASE_DONE) {
            level = 0
            stage = 'idle'
          }
          break
      }
      out[i] = level
    }

    this.level = level
    this.stage = stage
  }
}
