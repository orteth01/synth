import type {
  AmpEnvelope,
  FilterEnvelope,
  FilterSettings,
  LfoSettings,
  OscSettings,
} from '../audio/engine'

export const PRESET_VERSION = 1
const STORAGE_KEY = 'synth.userPresets.v1'

export interface PresetBody {
  oscs: OscSettings[]
  amp: AmpEnvelope
  filter: FilterSettings
  filterEnv: FilterEnvelope
  lfo: LfoSettings
  voices: number
}

export interface Preset extends PresetBody {
  version: typeof PRESET_VERSION
  name: string
}

interface StoredPresets {
  version: number
  presets: Preset[]
}

export function makePreset(name: string, body: PresetBody): Preset {
  return { ...body, version: PRESET_VERSION, name }
}

export function loadUserPresets(storage: Storage = safeLocalStorage()): Preset[] {
  if (!storage) return []
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPresets>
    if (parsed.version !== PRESET_VERSION) return []
    if (!Array.isArray(parsed.presets)) return []
    return parsed.presets.filter(isValidPreset).map(migratePreset)
  } catch {
    return []
  }
}

// Backward-fill optional fields on older v1 presets so consumers can rely on the
// shape. Per AGENTS.md: optional additions are allowed within a version.
function migratePreset(p: Preset): Preset {
  return {
    ...p,
    oscs: p.oscs.map((o) => ({ ...o, enabled: o.enabled ?? true })),
  }
}

export function saveUserPresets(presets: Preset[], storage: Storage = safeLocalStorage()): void {
  if (!storage) return
  const wrapper: StoredPresets = { version: PRESET_VERSION, presets }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(wrapper))
  } catch {
    // ignore quota / privacy-mode failures
  }
}

export function isValidPreset(value: unknown): value is Preset {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  if (p.version !== PRESET_VERSION) return false
  if (typeof p.name !== 'string' || p.name.length === 0) return false
  if (!isOscArray(p.oscs)) return false
  if (!isAmp(p.amp)) return false
  if (!isFilter(p.filter)) return false
  if (!isFilterEnv(p.filterEnv)) return false
  if (!isLfo(p.lfo)) return false
  if (typeof p.voices !== 'number' || p.voices < 1 || p.voices > 8) return false
  return true
}

function isOscArray(v: unknown): v is OscSettings[] {
  if (!Array.isArray(v) || v.length !== 3) return false
  for (const o of v) {
    if (!o || typeof o !== 'object') return false
    const x = o as Record<string, unknown>
    if (!['saw', 'square', 'triangle', 'pulse'].includes(x.waveshape as string)) return false
    if (typeof x.coarse !== 'number') return false
    if (typeof x.fine !== 'number') return false
    if (typeof x.level !== 'number') return false
    // `enabled` is optional in older v1 presets; migratePreset fills it in.
    if (x.enabled !== undefined && typeof x.enabled !== 'boolean') return false
  }
  return true
}

function isAmp(v: unknown): v is AmpEnvelope {
  if (!v || typeof v !== 'object') return false
  const x = v as Record<string, unknown>
  return (
    typeof x.attackS === 'number' &&
    typeof x.decayS === 'number' &&
    typeof x.sustain === 'number' &&
    typeof x.releaseS === 'number'
  )
}

function isFilter(v: unknown): v is FilterSettings {
  if (!v || typeof v !== 'object') return false
  const x = v as Record<string, unknown>
  return typeof x.cutoffHz === 'number' && typeof x.resonance === 'number'
}

function isFilterEnv(v: unknown): v is FilterEnvelope {
  if (!isAmp(v)) return false
  const x = v as unknown as Record<string, unknown>
  return typeof x.envAmount === 'number'
}

function isLfo(v: unknown): v is LfoSettings {
  if (!v || typeof v !== 'object') return false
  const x = v as Record<string, unknown>
  if (!['sine', 'triangle', 'square', 'sh'].includes(x.shape as string)) return false
  if (typeof x.rateHz !== 'number') return false
  if (typeof x.depth !== 'number') return false
  if (!['off', 'pitch', 'cutoff', 'amp'].includes(x.destination as string)) return false
  return true
}

function safeLocalStorage(): Storage {
  if (typeof globalThis === 'undefined') return null as unknown as Storage
  return (globalThis as unknown as { localStorage?: Storage }).localStorage ?? (null as unknown as Storage)
}

export const FACTORY_PRESETS: ReadonlyArray<Preset> = [
  {
    version: PRESET_VERSION,
    name: 'Moog Bass',
    oscs: [
      { enabled: true, waveshape: 'saw', coarse: 0, fine: 0, level: 0.85 },
      { enabled: true, waveshape: 'saw', coarse: 0, fine: -7, level: 0.4 },
      { enabled: true, waveshape: 'square', coarse: -12, fine: 0, level: 0.35 },
    ],
    amp: { attackS: 0.001, decayS: 0.3, sustain: 0.55, releaseS: 0.12 },
    filter: { cutoffHz: 240, resonance: 0.55 },
    filterEnv: { attackS: 0.001, decayS: 0.45, sustain: 0, releaseS: 0.2, envAmount: 0.7 },
    lfo: { shape: 'triangle', rateHz: 5, depth: 0, destination: 'pitch' },
    voices: 1,
  },
  {
    version: PRESET_VERSION,
    name: 'Bright Lead',
    oscs: [
      { enabled: true, waveshape: 'saw', coarse: 0, fine: 0, level: 0.7 },
      { enabled: true, waveshape: 'saw', coarse: 0, fine: 8, level: 0.5 },
      { enabled: true, waveshape: 'pulse', coarse: 0, fine: -3, level: 0.4 },
    ],
    amp: { attackS: 0.005, decayS: 0.25, sustain: 0.7, releaseS: 0.12 },
    filter: { cutoffHz: 2400, resonance: 0.3 },
    filterEnv: { attackS: 0.05, decayS: 0.4, sustain: 0.4, releaseS: 0.2, envAmount: 0.3 },
    lfo: { shape: 'sine', rateHz: 6, depth: 0, destination: 'pitch' },
    voices: 1,
  },
  {
    version: PRESET_VERSION,
    name: 'Lush Pad',
    oscs: [
      { enabled: true, waveshape: 'saw', coarse: 0, fine: 0, level: 0.6 },
      { enabled: true, waveshape: 'saw', coarse: 0, fine: 11, level: 0.55 },
      { enabled: true, waveshape: 'triangle', coarse: -7, fine: 0, level: 0.4 },
    ],
    amp: { attackS: 1.2, decayS: 1, sustain: 0.75, releaseS: 1.8 },
    filter: { cutoffHz: 1300, resonance: 0.18 },
    filterEnv: { attackS: 1.5, decayS: 1, sustain: 0.45, releaseS: 1.2, envAmount: 0.2 },
    lfo: { shape: 'sine', rateHz: 0.3, depth: 0.25, destination: 'pitch' },
    voices: 8,
  },
  {
    version: PRESET_VERSION,
    name: 'S&H Wobble',
    oscs: [
      { enabled: true, waveshape: 'square', coarse: 0, fine: 0, level: 0.7 },
      { enabled: true, waveshape: 'saw', coarse: -12, fine: 0, level: 0.4 },
      { enabled: false, waveshape: 'saw', coarse: 0, fine: 7, level: 0 },
    ],
    amp: { attackS: 0.002, decayS: 0.4, sustain: 0.7, releaseS: 0.3 },
    filter: { cutoffHz: 350, resonance: 0.7 },
    filterEnv: { attackS: 0.005, decayS: 0.3, sustain: 0.1, releaseS: 0.3, envAmount: 0.4 },
    lfo: { shape: 'sh', rateHz: 8, depth: 0.55, destination: 'cutoff' },
    voices: 1,
  },
]
