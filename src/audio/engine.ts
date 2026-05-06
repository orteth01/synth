import { VoiceAllocator } from './voice-allocator'

const WORKLET_URL = '/worklets/voice.worklet.js'
const PROCESSOR_NAME = 'voice'
const MAX_VOICES = 8
const PARAM_SMOOTH_S = 0.005
const PITCH_BEND_SMOOTH_S = 0.01

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

export type LfoShape = 'sine' | 'triangle' | 'square' | 'sh'
export type LfoDestination = 'off' | 'pitch' | 'cutoff' | 'amp'

export interface LfoSettings {
  shape: LfoShape
  rateHz: number
  depth: number
  destination: LfoDestination
}

interface HeldNote {
  velocity: number
  pressOrder: number
}

export class Engine {
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private masterGain: GainNode | null = null
  private started = false

  private allocator = new VoiceAllocator(MAX_VOICES, MAX_VOICES)
  private heldNotes = new Map<number, HeldNote>()
  private pressCounter = 0

  async init(): Promise<void> {
    if (this.ctx) return
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    await ctx.audioWorklet.addModule(WORKLET_URL)
    const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })
    const masterGain = ctx.createGain()
    masterGain.gain.value = 0.8
    node.connect(masterGain)
    masterGain.connect(ctx.destination)
    this.ctx = ctx
    this.node = node
    this.masterGain = masterGain
  }

  setMasterVolume(v: number): void {
    if (!this.masterGain || !this.ctx) return
    const clamped = v < 0 ? 0 : v > 1 ? 1 : v
    this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, PARAM_SMOOTH_S)
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

  setMaxVoices(n: number): void {
    const clamped = Math.max(1, Math.min(MAX_VOICES, Math.round(n)))
    this.allocator.setMaxActive(clamped)
  }

  getMaxVoices(): number {
    return this.allocator.getMaxActive()
  }

  noteOn(midiNote: number, velocity: number = 1): void {
    if (!this.node) return
    if (!this.started) void this.start().catch(() => {})

    this.heldNotes.delete(midiNote)
    this.heldNotes.set(midiNote, { velocity, pressOrder: ++this.pressCounter })

    const { voiceIndex, stolenNote } = this.allocator.allocate(midiNote)
    if (stolenNote !== null) this.heldNotes.delete(stolenNote)

    this.node.port.postMessage({
      type: 'noteOn',
      voiceIndex,
      note: midiNote,
      velocity,
    })
  }

  noteOff(midiNote: number): void {
    if (!this.node) return
    this.heldNotes.delete(midiNote)

    const voiceIndex = this.allocator.release(midiNote)
    if (voiceIndex === -1) return

    if (this.allocator.getMaxActive() === 1 && this.heldNotes.size > 0) {
      // Mono last-note priority: fall back to most-recent still-held note.
      const fallback = mostRecentHeld(this.heldNotes)
      if (fallback !== null) {
        this.allocator.reassign(voiceIndex, fallback.note)
        this.node.port.postMessage({
          type: 'noteOn',
          voiceIndex,
          note: fallback.note,
          velocity: fallback.velocity,
        })
        return
      }
    }

    this.node.port.postMessage({ type: 'noteOff', voiceIndex })
  }

  allNotesOff(): void {
    if (!this.node) return
    this.heldNotes.clear()
    this.allocator.freeAll()
    this.node.port.postMessage({ type: 'allOff' })
  }

  setPitchBend(semitones: number): void {
    if (!this.node || !this.ctx) return
    this.node.parameters
      .get('pitchBend')
      ?.setTargetAtTime(semitones, this.ctx.currentTime, PITCH_BEND_SMOOTH_S)
  }

  setModWheel(value: number): void {
    if (!this.node || !this.ctx) return
    this.node.parameters
      .get('lfoModWheel')
      ?.setTargetAtTime(value, this.ctx.currentTime, PARAM_SMOOTH_S)
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

  setAmpEnvelope(env: AmpEnvelope): void {
    if (!this.node || !this.ctx) return
    const t = this.ctx.currentTime
    this.node.parameters.get('attack')?.setValueAtTime(env.attackS, t)
    this.node.parameters.get('decay')?.setValueAtTime(env.decayS, t)
    this.node.parameters.get('sustain')?.setValueAtTime(env.sustain, t)
    this.node.parameters.get('release')?.setValueAtTime(env.releaseS, t)
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

  setLfo(s: LfoSettings): void {
    if (!this.node || !this.ctx) return
    const t = this.ctx.currentTime
    this.node.parameters.get('lfoRate')?.setTargetAtTime(s.rateHz, t, PARAM_SMOOTH_S)
    this.node.parameters.get('lfoDepth')?.setTargetAtTime(s.depth, t, PARAM_SMOOTH_S)
    this.node.port.postMessage({ type: 'setLfoShape', shape: s.shape })
    this.node.port.postMessage({ type: 'setLfoDest', dest: s.destination })
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
    this.masterGain?.disconnect()
    this.masterGain = null
    void this.ctx?.close()
    this.ctx = null
    this.started = false
    this.heldNotes.clear()
    this.allocator.freeAll()
  }
}

function mostRecentHeld(
  held: Map<number, HeldNote>,
): { note: number; velocity: number } | null {
  let bestNote: number | null = null
  let bestOrder = -1
  let bestVelocity = 1
  for (const [note, info] of held) {
    if (info.pressOrder > bestOrder) {
      bestOrder = info.pressOrder
      bestNote = note
      bestVelocity = info.velocity
    }
  }
  if (bestNote === null) return null
  return { note: bestNote, velocity: bestVelocity }
}
