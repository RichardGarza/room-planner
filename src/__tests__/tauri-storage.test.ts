import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DOC_VERSION } from '../migrate'
import type { RoomDoc } from '../types'
import { defaultRoom } from '../data'

/* An in-memory stand-in for the Tauri fs plugin: paths are "Room Planner/<file>". */
const files = new Map<string, string>()
const FOLDER = 'Room Planner'

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { Document: 'doc' },
  exists: async () => true,
  mkdir: async () => undefined,
  readDir: async () => [...files.keys()].map((name) => ({ name, isFile: true, isDirectory: false, isSymlink: false })),
  readTextFile: async (path: string) => {
    const name = path.replace(`${FOLDER}/`, '')
    if (!files.has(name)) throw new Error('ENOENT')
    return files.get(name)!
  },
  writeTextFile: async (path: string, text: string) => { files.set(path.replace(`${FOLDER}/`, ''), text) },
  writeFile: async () => undefined,
  remove: async (path: string) => { files.delete(path.replace(`${FOLDER}/`, '')) },
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: async () => null, save: async () => null }))

import { TauriFsBackend } from '../storage/tauri'

const doc = (id: string, name: string, updatedAt = '2026-01-01T00:00:00.000Z', patch: Partial<RoomDoc> = {}): RoomDoc => ({
  id, name, group: '', notes: '', createdAt: updatedAt, updatedAt,
  room: { ...defaultRoom, name }, items: [], layouts: [],
  settings: { daytime: true, doorAngle: 70, blinds: 40, bedding: true, walkHeight: 'adult', quality: 'best' },
  version: DOC_VERSION,
  ...patch,
})

const put = (name: string, d: RoomDoc) => files.set(name, JSON.stringify(d))
const read = (name: string) => JSON.parse(files.get(name)!) as RoomDoc

beforeEach(() => files.clear())

describe('TauriFsBackend.list()', () => {
  it('adopts a hand-dropped file under its canonical name', async () => {
    put('dropped.json', doc('room-abc', 'Dropped'))
    const list = await new TauriFsBackend().list()
    expect(list.map((r) => r.id)).toEqual(['room-abc'])
    expect([...files.keys()]).toEqual(['dropped--room-abc.json'])
  })

  it('never lets a backup copy overwrite the current room', async () => {
    const current = doc('room-abc', 'Study', '2026-03-01T00:00:00.000Z', { notes: 'latest edits' })
    const backup = doc('room-abc', 'Study', '2026-01-01T00:00:00.000Z', { notes: 'old backup' })
    put('study--room-abc.json', current)
    put('study--room-abc copy.json', backup)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = await new TauriFsBackend().list()
    warn.mockRestore()

    // the canonical file is untouched
    expect(read('study--room-abc.json').notes).toBe('latest edits')
    expect(files.has('study--room-abc copy.json')).toBe(false)
    // the copy became a room of its own with a fresh id and file
    expect(list).toHaveLength(2)
    const copy = list.find((r) => r.id !== 'room-abc')!
    expect(copy.id).toMatch(/^room-/)
    expect(copy.name).toBe('Study (copy)')
    const copyFile = [...files.keys()].find((n) => n.endsWith(`--${copy.id}.json`))!
    expect(copyFile).toBe(`study-copy--${copy.id}.json`)
    expect(read(copyFile).notes).toBe('old backup')
    expect(read(copyFile).id).toBe(copy.id)

    // loading by id still gives the current room
    const loaded = await new TauriFsBackend().load('room-abc')
    expect(loaded?.notes).toBe('latest edits')
  })

  it('gives a fresh id to a second stray file with an id already adopted in the same listing', async () => {
    put('a.json', doc('room-x', 'One'))
    put('b.json', doc('room-x', 'Two'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = await new TauriFsBackend().list()
    warn.mockRestore()
    expect(list).toHaveLength(2)
    expect(new Set(list.map((r) => r.id)).size).toBe(2)
    expect(list.some((r) => r.id === 'room-x')).toBe(true)
    expect(files.size).toBe(2)
  })
})
