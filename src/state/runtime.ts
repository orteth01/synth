// Tauri 2 injects __TAURI_INTERNALS__ into the page; presence of that global is
// the official runtime check.
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
