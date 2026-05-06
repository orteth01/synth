import { describe, it, expect } from 'vitest'
import { VoiceAllocator } from './voice-allocator'

describe('VoiceAllocator', () => {
  it('uses free voices first', () => {
    const a = new VoiceAllocator(4, 4)
    const r1 = a.allocate(60)
    const r2 = a.allocate(62)
    const r3 = a.allocate(64)
    expect(r1.voiceIndex).toBe(0)
    expect(r2.voiceIndex).toBe(1)
    expect(r3.voiceIndex).toBe(2)
    expect(r1.stolenNote).toBeNull()
    expect(r2.stolenNote).toBeNull()
  })

  it('steals oldest releasing voice when none free', () => {
    const a = new VoiceAllocator(2, 2)
    a.allocate(60) // voice 0, playing
    a.allocate(62) // voice 1, playing
    a.release(60) // voice 0, releasing
    a.release(62) // voice 1, releasing (later)
    const r = a.allocate(64)
    expect(r.voiceIndex).toBe(0)
    expect(r.stolenNote).toBe(60)
  })

  it('steals oldest playing voice when no releasing', () => {
    const a = new VoiceAllocator(2, 2)
    a.allocate(60) // voice 0
    a.allocate(62) // voice 1
    const r = a.allocate(64)
    expect(r.voiceIndex).toBe(0)
    expect(r.stolenNote).toBe(60)
  })

  it('honors maxActive cap (mono mode)', () => {
    const a = new VoiceAllocator(8, 1)
    const r1 = a.allocate(60)
    const r2 = a.allocate(62)
    expect(r1.voiceIndex).toBe(0)
    expect(r2.voiceIndex).toBe(0)
    expect(r2.stolenNote).toBe(60)
  })

  it('release returns the voice index for the note', () => {
    const a = new VoiceAllocator(4, 4)
    a.allocate(60)
    a.allocate(62)
    expect(a.release(62)).toBe(1)
    expect(a.release(60)).toBe(0)
    expect(a.release(99)).toBe(-1)
  })

  it('reassign tracks the latest note for a voice slot', () => {
    const a = new VoiceAllocator(1, 1)
    a.allocate(60)
    expect(a.voiceForNote(60)).toBe(0)
    const stolen = a.reassign(0, 64)
    expect(stolen).toBe(60)
    expect(a.voiceForNote(60)).toBe(-1)
    expect(a.voiceForNote(64)).toBe(0)
  })

  it('free returns a slot to the available pool', () => {
    const a = new VoiceAllocator(2, 2)
    a.allocate(60)
    a.release(60)
    a.free(0)
    const r = a.allocate(64)
    expect(r.voiceIndex).toBe(0)
    expect(r.stolenNote).toBeNull()
  })
})
