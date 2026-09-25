import type { RoomDoc, RoomSummary } from '../types'

/**
 * Where room documents live. The browser build uses localStorage; the Mac app
 * (Tauri) writes JSON files to ~/Documents/Room Planner. Both implement this.
 */
export interface RoomStorage {
  /** Human-readable description of where files go, shown in the library UI. */
  readonly location: string
  list(): Promise<RoomSummary[]>
  load(id: string): Promise<RoomDoc | null>
  save(doc: RoomDoc): Promise<void>
  remove(id: string): Promise<void>
  /** Optional: hand the user a JSON file (native dialog in Tauri, download in the browser). */
  exportDoc?(doc: RoomDoc): Promise<void>
  /** Optional: let the user pick a JSON file to import; resolves null when cancelled. */
  importDoc?(): Promise<RoomDoc | null>
  /** Optional: hand the user a binary file such as a PDF (native save dialog in Tauri, download in the browser). Resolves silently when cancelled. */
  saveFile?(name: string, data: Uint8Array, mime: string): Promise<void>
}

export function summarize(doc: RoomDoc): RoomSummary {
  return {
    id: doc.id,
    name: doc.name,
    group: doc.group,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
    w: doc.room.w,
    d: doc.room.d,
    itemCount: doc.items.filter((i) => i.inRoom).length,
  }
}
