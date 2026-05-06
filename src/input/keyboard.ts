export type MidiNote = number

const BOTTOM_ROW_OFFSETS: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  ',': 12, l: 13, '.': 14,
}

const TOP_ROW_OFFSETS: Record<string, number> = {
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20,
  y: 21, '7': 22, u: 23,
  i: 24, '9': 25, o: 26, '0': 27, p: 28,
}

const OCTAVE_DOWN_KEY = '['
const OCTAVE_UP_KEY = ']'

const MIN_OCTAVE = 0
const MAX_OCTAVE = 8

export function keyToOffset(key: string): number | null {
  const k = key.toLowerCase()
  if (k in BOTTOM_ROW_OFFSETS) return BOTTOM_ROW_OFFSETS[k]
  if (k in TOP_ROW_OFFSETS) return TOP_ROW_OFFSETS[k]
  return null
}

/** Stack tracking last-note priority. Kept for tests and as a building block for
 *  any future per-input legato logic — the engine itself owns the master stack
 *  in step 10's polyphony refactor. */
export class MonoNoteStack {
  private stack: MidiNote[] = []

  press(note: MidiNote): MidiNote {
    const idx = this.stack.indexOf(note)
    if (idx !== -1) this.stack.splice(idx, 1)
    this.stack.push(note)
    return note
  }

  release(note: MidiNote): MidiNote | null {
    const idx = this.stack.indexOf(note)
    if (idx !== -1) this.stack.splice(idx, 1)
    return this.top
  }

  clear(): void {
    this.stack = []
  }

  get top(): MidiNote | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null
  }
}

export interface KeyboardOptions {
  onNoteOn(note: MidiNote): void
  onNoteOff(note: MidiNote): void
  onOctaveChange?(octave: number): void
  onHeldNotesChange?(notes: ReadonlySet<MidiNote>): void
}

export class KeyboardInput {
  private octave = 4
  private heldKeyNotes = new Map<string, MidiNote>()
  private opts: KeyboardOptions
  private attached = false

  constructor(opts: KeyboardOptions) {
    this.opts = opts
  }

  attach(): void {
    if (this.attached) return
    window.addEventListener('keydown', this.onDown)
    window.addEventListener('keyup', this.onUp)
    window.addEventListener('blur', this.onBlur)
    this.attached = true
  }

  detach(): void {
    if (!this.attached) return
    window.removeEventListener('keydown', this.onDown)
    window.removeEventListener('keyup', this.onUp)
    window.removeEventListener('blur', this.onBlur)
    this.attached = false
    this.releaseAll()
  }

  setOctave(o: number): void {
    const clamped = Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, o))
    if (clamped === this.octave) return
    this.octave = clamped
    this.opts.onOctaveChange?.(this.octave)
  }

  get currentOctave(): number {
    return this.octave
  }

  private onDown = (e: KeyboardEvent) => {
    if (shouldIgnoreEvent(e)) return
    if (e.repeat) return

    if (e.key === OCTAVE_DOWN_KEY) {
      e.preventDefault()
      this.setOctave(this.octave - 1)
      return
    }
    if (e.key === OCTAVE_UP_KEY) {
      e.preventDefault()
      this.setOctave(this.octave + 1)
      return
    }

    const offset = keyToOffset(e.key)
    if (offset === null) return
    if (this.heldKeyNotes.has(e.key)) return

    e.preventDefault()
    const note = 12 * (this.octave + 1) + offset
    if (note < 0 || note > 127) return
    this.heldKeyNotes.set(e.key, note)
    this.opts.onNoteOn(note)
    this.notifyHeld()
  }

  private onUp = (e: KeyboardEvent) => {
    const note = this.heldKeyNotes.get(e.key)
    if (note === undefined) return
    this.heldKeyNotes.delete(e.key)
    this.opts.onNoteOff(note)
    this.notifyHeld()
  }

  private onBlur = () => {
    this.releaseAll()
  }

  private releaseAll(): void {
    if (this.heldKeyNotes.size === 0) return
    const notes = [...this.heldKeyNotes.values()]
    this.heldKeyNotes.clear()
    for (const n of notes) this.opts.onNoteOff(n)
    this.notifyHeld()
  }

  private notifyHeld(): void {
    const cb = this.opts.onHeldNotesChange
    if (!cb) return
    cb(new Set(this.heldKeyNotes.values()))
  }
}

function shouldIgnoreEvent(e: KeyboardEvent): boolean {
  const target = e.target
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true
  if (target.isContentEditable) return true
  return false
}
