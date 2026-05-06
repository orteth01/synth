import { MonoNoteStack, type MidiNote } from './keyboard'

export interface MidiDevice {
  id: string
  name: string
}

export interface MidiOptions {
  onNoteOn(note: MidiNote, velocity: number): void
  onNoteOff(): void
  onPitchBend(semitones: number): void
  onModWheel(value: number): void
  onDevicesChange(devices: MidiDevice[]): void
  onSelectedDeviceChange(id: string | null): void
  onError(message: string): void
}

const PITCH_BEND_RANGE_SEMITONES = 2
const DEFAULT_VELOCITY_FALLBACK = 0.8

export class MidiInput {
  private access: MIDIAccess | null = null
  private currentInput: MIDIInput | null = null
  private opts: MidiOptions
  private stack = new MonoNoteStack()
  private heldVelocities = new Map<MidiNote, number>()
  private sustainHeld = new Set<MidiNote>()
  private sustainPressed = false

  constructor(opts: MidiOptions) {
    this.opts = opts
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  }

  async start(): Promise<void> {
    if (!this.isSupported()) {
      this.opts.onError('Web MIDI API not supported in this browser')
      return
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
    } catch (e) {
      this.opts.onError(
        e instanceof Error ? `MIDI access denied: ${e.message}` : 'MIDI access denied',
      )
      return
    }
    this.access.onstatechange = () => this.refreshDevices()
    this.refreshDevices()
  }

  stop(): void {
    this.detachInput()
    if (this.access) this.access.onstatechange = null
    this.access = null
  }

  selectDevice(id: string | null): void {
    this.detachInput()
    if (!this.access || id === null) {
      this.opts.onSelectedDeviceChange(null)
      return
    }
    const input = this.access.inputs.get(id)
    if (!input) {
      this.opts.onSelectedDeviceChange(null)
      return
    }
    input.onmidimessage = (e: MIDIMessageEvent) => this.handleMessage(e)
    this.currentInput = input
    this.opts.onSelectedDeviceChange(id)
  }

  panic(): void {
    this.heldVelocities.clear()
    this.sustainHeld.clear()
    this.sustainPressed = false
    this.stack.clear()
    this.opts.onNoteOff()
  }

  /** Test seam — feed raw MIDI bytes without going through MIDIMessageEvent. */
  handleRawMessage(data: ArrayLike<number>): void {
    this.dispatch(data)
  }

  private refreshDevices(): void {
    if (!this.access) return
    const devices: MidiDevice[] = []
    for (const input of this.access.inputs.values()) {
      devices.push({ id: input.id, name: input.name ?? 'Unknown' })
    }
    this.opts.onDevicesChange(devices)

    if (this.currentInput) {
      const stillPresent = devices.some((d) => d.id === this.currentInput!.id)
      if (!stillPresent) this.detachInput()
    }
    if (!this.currentInput && devices.length > 0) {
      this.selectDevice(devices[0].id)
    } else if (devices.length === 0) {
      this.opts.onSelectedDeviceChange(null)
    }
  }

  private detachInput(): void {
    if (this.currentInput) {
      this.currentInput.onmidimessage = null
      this.currentInput = null
    }
  }

  private handleMessage(e: MIDIMessageEvent): void {
    const data = e.data
    if (!data) return
    this.dispatch(data)
  }

  private dispatch(data: ArrayLike<number>): void {
    if (data.length === 0) return
    const status = data[0] & 0xf0

    switch (status) {
      case 0x90: {
        const note = data[1]
        const velocity = data[2] ?? 0
        if (velocity > 0) this.noteOn(note, velocity / 127)
        else this.noteOff(note)
        break
      }
      case 0x80:
        this.noteOff(data[1])
        break
      case 0xb0: {
        const cc = data[1]
        const value = data[2] ?? 0
        if (cc === 1) {
          this.opts.onModWheel(value / 127)
        } else if (cc === 64) {
          this.setSustain(value >= 64)
        } else if (cc === 120 || cc === 123) {
          this.panic()
        }
        break
      }
      case 0xe0: {
        const lsb = data[1]
        const msb = data[2] ?? 0
        const raw = (msb << 7) | lsb // 0..16383
        const normalized = (raw - 8192) / 8192 // -1..~1
        this.opts.onPitchBend(normalized * PITCH_BEND_RANGE_SEMITONES)
        break
      }
    }
  }

  private noteOn(note: MidiNote, velocity: number): void {
    this.sustainHeld.delete(note)
    this.heldVelocities.set(note, velocity)
    const active = this.stack.press(note)
    this.opts.onNoteOn(active, velocity)
  }

  private noteOff(note: MidiNote): void {
    if (this.sustainPressed) {
      this.sustainHeld.add(note)
      return
    }
    this.releaseNote(note)
  }

  private releaseNote(note: MidiNote): void {
    this.heldVelocities.delete(note)
    const next = this.stack.release(note)
    if (next !== null) {
      const vel = this.heldVelocities.get(next) ?? DEFAULT_VELOCITY_FALLBACK
      this.opts.onNoteOn(next, vel)
    } else {
      this.opts.onNoteOff()
    }
  }

  private setSustain(pressed: boolean): void {
    if (pressed === this.sustainPressed) return
    this.sustainPressed = pressed
    if (!pressed) {
      const deferred = [...this.sustainHeld]
      this.sustainHeld.clear()
      for (const n of deferred) this.releaseNote(n)
    }
  }
}
