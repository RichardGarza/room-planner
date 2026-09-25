import { LocalStorageBackend } from './local'
import type { RoomStorage } from './types'

export type { RoomStorage } from './types'
export { summarize } from './types'

let instance: RoomStorage | null = null

/** True when running inside the Tauri Mac app. */
export function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Pick the backend once. The Tauri backend (src/storage/tauri.ts) is loaded
 * lazily so the plain web build never pulls in the Tauri packages.
 */
export async function getStorage(): Promise<RoomStorage> {
  if (instance) return instance
  if (isTauri()) {
    try {
      const mod = await import('./tauri')
      instance = new mod.TauriFsBackend()
      return instance
    } catch (err) {
      console.warn('Tauri storage unavailable, falling back to localStorage', err)
    }
  }
  instance = new LocalStorageBackend()
  return instance
}
