import {
  PRESET_VERSION,
  isValidPreset,
  loadUserPresets as loadFromLocalStorage,
  saveUserPresets as saveToLocalStorage,
  type Preset,
} from './presets'
import { isTauri } from './runtime'

const FILENAME = 'presets.v1.json'

export interface PresetStorage {
  readonly kind: 'web' | 'desktop'
  load(): Promise<Preset[]>
  save(presets: Preset[]): Promise<void>
}

class WebPresetStorage implements PresetStorage {
  readonly kind = 'web' as const
  async load(): Promise<Preset[]> {
    return loadFromLocalStorage()
  }
  async save(presets: Preset[]): Promise<void> {
    saveToLocalStorage(presets)
  }
}

// Imports from @tauri-apps/plugin-fs are deferred so the web bundle can drop
// them entirely (Vite splits dynamic imports into separate chunks).
class TauriPresetStorage implements PresetStorage {
  readonly kind = 'desktop' as const

  async load(): Promise<Preset[]> {
    const fs = await import('@tauri-apps/plugin-fs')
    try {
      const present = await fs.exists(FILENAME, { baseDir: fs.BaseDirectory.AppData })
      if (!present) return []
      const text = await fs.readTextFile(FILENAME, { baseDir: fs.BaseDirectory.AppData })
      const parsed = JSON.parse(text)
      if (parsed?.version !== PRESET_VERSION) return []
      if (!Array.isArray(parsed.presets)) return []
      return parsed.presets.filter(isValidPreset)
    } catch {
      return []
    }
  }

  async save(presets: Preset[]): Promise<void> {
    const fs = await import('@tauri-apps/plugin-fs')
    const wrapper = { version: PRESET_VERSION, presets }
    try {
      // Ensure the app data directory exists. mkdir on the root is a no-op on
      // most platforms but standardises behaviour across them.
      const dirPresent = await fs.exists('', { baseDir: fs.BaseDirectory.AppData })
      if (!dirPresent) {
        await fs.mkdir('', { baseDir: fs.BaseDirectory.AppData, recursive: true })
      }
      await fs.writeTextFile(FILENAME, JSON.stringify(wrapper, null, 2), {
        baseDir: fs.BaseDirectory.AppData,
      })
    } catch (e) {
      console.error('Failed to save presets:', e)
    }
  }
}

export function getPresetStorage(): PresetStorage {
  return isTauri() ? new TauriPresetStorage() : new WebPresetStorage()
}
