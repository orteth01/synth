import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MidiInput } from './midi'

function makeInput() {
  const onNoteOn = vi.fn()
  const onNoteOff = vi.fn()
  const onPitchBend = vi.fn()
  const onModWheel = vi.fn()
  const onPanic = vi.fn()
  const onDevicesChange = vi.fn()
  const onSelectedDeviceChange = vi.fn()
  const onError = vi.fn()
  const m = new MidiInput({
    onNoteOn,
    onNoteOff,
    onPitchBend,
    onModWheel,
    onPanic,
    onDevicesChange,
    onSelectedDeviceChange,
    onError,
  })
  return { m, onNoteOn, onNoteOff, onPitchBend, onModWheel, onPanic }
}

describe('MidiInput message handling', () => {
  let h: ReturnType<typeof makeInput>
  beforeEach(() => {
    h = makeInput()
  })

  it('note-on with velocity > 0 fires onNoteOn', () => {
    h.m.handleRawMessage([0x90, 60, 100])
    expect(h.onNoteOn).toHaveBeenCalledWith(60, 100 / 127)
  })

  it('note-on with velocity 0 fires onNoteOff for that note', () => {
    h.m.handleRawMessage([0x90, 60, 100])
    h.m.handleRawMessage([0x90, 60, 0])
    expect(h.onNoteOff).toHaveBeenCalledWith(60)
  })

  it('explicit note-off message fires onNoteOff for that note', () => {
    h.m.handleRawMessage([0x90, 60, 100])
    h.m.handleRawMessage([0x80, 60, 0])
    expect(h.onNoteOff).toHaveBeenCalledWith(60)
  })

  it('overlapping note-offs each emit their own release', () => {
    h.m.handleRawMessage([0x90, 60, 100])
    h.m.handleRawMessage([0x90, 64, 80])
    h.m.handleRawMessage([0x80, 64, 0])
    expect(h.onNoteOff).toHaveBeenLastCalledWith(64)
  })

  it('CC1 fires onModWheel normalised to 0..1', () => {
    h.m.handleRawMessage([0xb0, 1, 64])
    expect(h.onModWheel).toHaveBeenCalledWith(64 / 127)
  })

  it('pitch bend at center reports 0 semitones', () => {
    h.m.handleRawMessage([0xe0, 0, 64]) // raw = 8192 (center)
    expect(h.onPitchBend).toHaveBeenCalledWith(0)
  })

  it('pitch bend at full positive reports +2 semitones', () => {
    h.m.handleRawMessage([0xe0, 127, 127])
    const arg = h.onPitchBend.mock.calls.at(-1)![0] as number
    expect(arg).toBeCloseTo(2, 2)
  })

  it('pitch bend at full negative reports -2 semitones', () => {
    h.m.handleRawMessage([0xe0, 0, 0])
    const arg = h.onPitchBend.mock.calls.at(-1)![0] as number
    expect(arg).toBeCloseTo(-2, 2)
  })

  it('sustain pedal defers note-off until pedal released', () => {
    h.m.handleRawMessage([0xb0, 64, 127])
    h.m.handleRawMessage([0x90, 60, 100])
    h.m.handleRawMessage([0x80, 60, 0])
    expect(h.onNoteOff).not.toHaveBeenCalled()
    h.m.handleRawMessage([0xb0, 64, 0])
    expect(h.onNoteOff).toHaveBeenCalledWith(60)
  })

  it('CC123 (all notes off) panics', () => {
    h.m.handleRawMessage([0x90, 60, 100])
    h.m.handleRawMessage([0xb0, 123, 0])
    expect(h.onPanic).toHaveBeenCalled()
  })
})
