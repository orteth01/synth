import { describe, it, expect, beforeEach } from 'vitest'
import {
  FACTORY_PRESETS,
  PRESET_VERSION,
  isValidPreset,
  loadUserPresets,
  makePreset,
  saveUserPresets,
} from './presets'

class FakeStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

const SAMPLE_BODY = FACTORY_PRESETS[0]

describe('preset persistence', () => {
  let storage: FakeStorage
  beforeEach(() => {
    storage = new FakeStorage()
  })

  it('returns empty array when storage is empty', () => {
    expect(loadUserPresets(storage)).toEqual([])
  })

  it('round-trips presets through save/load', () => {
    const a = makePreset('My Bass', SAMPLE_BODY)
    const b = makePreset('My Lead', SAMPLE_BODY)
    saveUserPresets([a, b], storage)
    const loaded = loadUserPresets(storage)
    expect(loaded).toHaveLength(2)
    expect(loaded[0].name).toBe('My Bass')
    expect(loaded[1].name).toBe('My Lead')
  })

  it('drops presets with the wrong version', () => {
    const wrapper = {
      version: PRESET_VERSION,
      presets: [
        { ...makePreset('a', SAMPLE_BODY), version: 999 },
        makePreset('b', SAMPLE_BODY),
      ],
    }
    storage.setItem('synth.userPresets.v1', JSON.stringify(wrapper))
    const loaded = loadUserPresets(storage)
    expect(loaded.map((p) => p.name)).toEqual(['b'])
  })

  it('returns [] when the wrapper has the wrong version', () => {
    storage.setItem('synth.userPresets.v1', JSON.stringify({ version: 999, presets: [] }))
    expect(loadUserPresets(storage)).toEqual([])
  })

  it('returns [] for malformed JSON', () => {
    storage.setItem('synth.userPresets.v1', '{not json')
    expect(loadUserPresets(storage)).toEqual([])
  })
})

describe('isValidPreset', () => {
  it('accepts well-formed presets', () => {
    expect(isValidPreset(FACTORY_PRESETS[0])).toBe(true)
  })

  it('rejects null/undefined/non-objects', () => {
    expect(isValidPreset(null)).toBe(false)
    expect(isValidPreset(undefined)).toBe(false)
    expect(isValidPreset(42)).toBe(false)
    expect(isValidPreset('preset')).toBe(false)
  })

  it('rejects when oscs is not length 3', () => {
    const p = makePreset('a', SAMPLE_BODY)
    expect(isValidPreset({ ...p, oscs: p.oscs.slice(0, 2) })).toBe(false)
  })

  it('rejects unknown waveshape values', () => {
    const p = makePreset('a', SAMPLE_BODY)
    const broken = { ...p, oscs: [{ ...p.oscs[0], waveshape: 'sin' }, p.oscs[1], p.oscs[2]] }
    expect(isValidPreset(broken)).toBe(false)
  })

  it('rejects voices outside 1..8', () => {
    const p = makePreset('a', SAMPLE_BODY)
    expect(isValidPreset({ ...p, voices: 0 })).toBe(false)
    expect(isValidPreset({ ...p, voices: 9 })).toBe(false)
  })
})

describe('factory presets', () => {
  it('all four factory presets validate', () => {
    expect(FACTORY_PRESETS).toHaveLength(4)
    for (const p of FACTORY_PRESETS) expect(isValidPreset(p)).toBe(true)
  })
})
