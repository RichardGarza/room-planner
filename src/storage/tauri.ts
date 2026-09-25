import type { RoomDoc } from '../types'
import { LocalStorageBackend } from './local'
import type { RoomStorage } from './types'

/**
 * Placeholder: the Mac app backend. Replaced by a real implementation that
 * writes JSON files to ~/Documents/Room Planner using @tauri-apps/plugin-fs.
 */
export class TauriFsBackend implements RoomStorage {
  private fallback = new LocalStorageBackend()
  readonly location = 'this app'
  list() { return this.fallback.list() }
  load(id: string) { return this.fallback.load(id) }
  save(doc: RoomDoc) { return this.fallback.save(doc) }
  remove(id: string) { return this.fallback.remove(id) }
}
