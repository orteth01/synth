import { describe, it, expect } from 'vitest'
import { MonoNoteStack, keyToOffset } from './keyboard'

describe('keyToOffset', () => {
  it('maps bottom-row keys to chromatic offsets from C', () => {
    expect(keyToOffset('z')).toBe(0)
    expect(keyToOffset('s')).toBe(1)
    expect(keyToOffset('x')).toBe(2)
    expect(keyToOffset('m')).toBe(11)
    expect(keyToOffset(',')).toBe(12)
  })

  it('maps top-row keys to the octave above', () => {
    expect(keyToOffset('q')).toBe(12)
    expect(keyToOffset('2')).toBe(13)
    expect(keyToOffset('p')).toBe(28)
  })

  it('is case-insensitive', () => {
    expect(keyToOffset('Z')).toBe(0)
    expect(keyToOffset('Q')).toBe(12)
  })

  it('returns null for unmapped keys', () => {
    expect(keyToOffset('a')).toBeNull()
    expect(keyToOffset('Tab')).toBeNull()
    expect(keyToOffset('[')).toBeNull()
  })
})

describe('MonoNoteStack last-note priority', () => {
  it('top is null when empty', () => {
    const s = new MonoNoteStack()
    expect(s.top).toBeNull()
  })

  it('press updates top to the most recent note', () => {
    const s = new MonoNoteStack()
    s.press(60)
    expect(s.top).toBe(60)
    s.press(62)
    expect(s.top).toBe(62)
    s.press(64)
    expect(s.top).toBe(64)
  })

  it('release of the top falls back to the previous note', () => {
    const s = new MonoNoteStack()
    s.press(60)
    s.press(62)
    s.press(64)
    expect(s.release(64)).toBe(62)
    expect(s.release(62)).toBe(60)
    expect(s.release(60)).toBeNull()
  })

  it('release of a non-top note leaves the top unchanged', () => {
    const s = new MonoNoteStack()
    s.press(60)
    s.press(62)
    s.press(64)
    expect(s.release(60)).toBe(64)
    expect(s.release(62)).toBe(64)
    expect(s.release(64)).toBeNull()
  })

  it('pressing an already-held note moves it to the top', () => {
    const s = new MonoNoteStack()
    s.press(60)
    s.press(62)
    expect(s.press(60)).toBe(60)
    expect(s.top).toBe(60)
    expect(s.release(60)).toBe(62)
  })

  it('release of an unknown note is a no-op', () => {
    const s = new MonoNoteStack()
    s.press(60)
    expect(s.release(99)).toBe(60)
    expect(s.top).toBe(60)
  })

  it('clear empties the stack', () => {
    const s = new MonoNoteStack()
    s.press(60)
    s.press(62)
    s.clear()
    expect(s.top).toBeNull()
  })
})
