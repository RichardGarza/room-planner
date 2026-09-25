import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* A tiny localStorage so the seed flag and store code that touches it work in node. */
class MemoryStorage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  key(i: number) { return [...this.m.keys()][i] ?? null }
}
;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage()

import { AUTOSAVE_MS, SEEDED_KEY, roomOpenings, timeAgo, useLibrary } from '../library'
import { useStore } from '../store'
import { summarize, type RoomStorage } from '../storage/types'
import { DOC_VERSION } from '../migrate'
import { defaultRoom } from '../data'
import type { RoomDoc } from '../types'

/** In-memory RoomStorage with hooks for export/import. */
class FakeStorage implements RoomStorage {
  readonly location = 'a test'
  docs = new Map<string, RoomDoc>()
  exported: RoomDoc[] = []
  nextImport: unknown = null
  saves = 0
  async list() { return [...this.docs.values()].map(summarize) }
  async load(id: string) { const d = this.docs.get(id); return d ? JSON.parse(JSON.stringify(d)) as RoomDoc : null }
  async save(doc: RoomDoc) { this.saves += 1; this.docs.set(doc.id, JSON.parse(JSON.stringify(doc))) }
  async remove(id: string) { this.docs.delete(id) }
  async exportDoc(doc: RoomDoc) { this.exported.push(doc) }
  async importDoc() { return this.nextImport as RoomDoc | null }
}

let storage: FakeStorage

beforeEach(async () => {
  await useLibrary.getState().close()
  localStorage.clear()
  storage = new FakeStorage()
  useLibrary.getState().configure({ storage })
  useLibrary.setState({ rooms: [], groups: [], currentId: null, status: 'idle', error: null })
})

afterEach(async () => {
  vi.useRealTimers()
  await useLibrary.getState().close()
})

describe('library', () => {
  it('seeds the example room once', async () => {
    await useLibrary.getState().refresh()
    let rooms = useLibrary.getState().rooms
    expect(rooms).toHaveLength(1)
    expect(rooms[0].name).toBe("Mila's room")
    expect(rooms[0].group).toBe('Examples')
    expect(rooms[0].itemCount).toBe(8)
    expect(useLibrary.getState().groups).toEqual(['Examples'])
    expect(useLibrary.getState().location).toBe('a test')
    expect(localStorage.getItem(SEEDED_KEY)).toBe('1')

    // deleting it and refreshing does not bring it back
    await useLibrary.getState().remove(rooms[0].id)
    await useLibrary.getState().refresh()
    rooms = useLibrary.getState().rooms
    expect(rooms).toHaveLength(0)
    expect(storage.docs.size).toBe(0)
  })

  it('create() adds a room and opens it in the planner', async () => {
    await useLibrary.getState().refresh()
    const id = await useLibrary.getState().create({ name: 'Study', group: 'Home', w: 320, d: 410 })
    const lib = useLibrary.getState()
    expect(lib.currentId).toBe(id)
    expect(lib.status).toBe('saved')
    expect(lib.rooms.map((r) => r.name).sort()).toEqual(["Mila's room", 'Study'])
    expect(lib.groups).toEqual(['Examples', 'Home'])
    const st = useStore.getState()
    expect(st.room.name).toBe('Study')
    expect(st.room.w).toBe(320)
    expect(st.room.d).toBe(410)
    expect(st.items).toEqual([])
    expect(st.savedLayouts).toEqual([])
    expect(storage.docs.get(id)?.group).toBe('Home')
  })

  it('opening the example room lights up preset A', async () => {
    await useLibrary.getState().refresh()
    const id = useLibrary.getState().rooms[0].id
    await useLibrary.getState().open(id)
    expect(useLibrary.getState().currentId).toBe(id)
    expect(useStore.getState().activeLayoutId).toBe('A')
    expect(useStore.getState().savedLayouts.map((l) => l.id)).toEqual(['A', 'B', 'C', 'now'])
  })

  it('autosaves edits after a debounce: dirty → saving → saved', async () => {
    await useLibrary.getState().refresh()
    const id = await useLibrary.getState().create({ name: 'Study' })
    vi.useFakeTimers()
    const savesBefore = storage.saves

    useStore.getState().setRoom({ w: 333 })
    expect(useLibrary.getState().status).toBe('dirty')
    useStore.getState().setRoom({ d: 444 })
    expect(useLibrary.getState().status).toBe('dirty')

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 50)
    expect(useLibrary.getState().status).toBe('dirty')
    expect(storage.saves).toBe(savesBefore)

    // the save starts at the debounce and finishes once the (fake) storage resolves
    const seen: string[] = []
    const unsub = useLibrary.subscribe((s) => { seen.push(s.status) })
    await vi.advanceTimersByTimeAsync(60)
    unsub()
    expect(seen).toContain('saving')
    expect(useLibrary.getState().status).toBe('saved')
    expect(storage.saves).toBe(savesBefore + 1)

    const saved = storage.docs.get(id)!
    expect(saved.room.w).toBe(333)
    expect(saved.room.d).toBe(444)
    const summary = useLibrary.getState().rooms.find((r) => r.id === id)!
    expect(summary.w).toBe(333)
    expect(summary.d).toBe(444)

    // display settings and saved layouts are part of the document too
    useStore.getState().setSetting('daytime', false)
    useStore.getState().saveLayout('Version 1')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 10)
    expect(storage.docs.get(id)!.settings.daytime).toBe(false)
    expect(storage.docs.get(id)!.layouts.map((l) => l.name)).toEqual(['Version 1'])
  })

  it('close() flushes a pending save first', async () => {
    await useLibrary.getState().refresh()
    const id = await useLibrary.getState().create({ name: 'Study' })
    useStore.getState().setRoom({ h: 280 })
    expect(useLibrary.getState().status).toBe('dirty')
    await useLibrary.getState().close()
    expect(useLibrary.getState().currentId).toBeNull()
    expect(storage.docs.get(id)!.room.h).toBe(280)
  })

  it('rename updates the summary and room.name', async () => {
    await useLibrary.getState().refresh()
    const id = await useLibrary.getState().create({ name: 'Study' })
    await useLibrary.getState().rename(id, 'Office')
    expect(useStore.getState().room.name).toBe('Office')
    expect(useLibrary.getState().rooms.find((r) => r.id === id)!.name).toBe('Office')
    expect(storage.docs.get(id)!.name).toBe('Office')
    expect(storage.docs.get(id)!.room.name).toBe('Office')

    // renaming a room that is not open
    const other = useLibrary.getState().rooms.find((r) => r.id !== id)!
    await useLibrary.getState().rename(other.id, 'Example')
    expect(useLibrary.getState().rooms.find((r) => r.id === other.id)!.name).toBe('Example')
    expect(storage.docs.get(other.id)!.room.name).toBe('Example')
    expect(useStore.getState().room.name).toBe('Office')
  })

  it('setGroup moves a room and updates the group list', async () => {
    await useLibrary.getState().refresh()
    const id = useLibrary.getState().rooms[0].id
    await useLibrary.getState().setGroup(id, 'Cabin')
    expect(useLibrary.getState().groups).toEqual(['Cabin'])
    expect(storage.docs.get(id)!.group).toBe('Cabin')
  })

  it('duplicate creates a copy with a new id', async () => {
    await useLibrary.getState().refresh()
    const id = useLibrary.getState().rooms[0].id
    const copyId = await useLibrary.getState().duplicate(id)
    expect(copyId).toBeTruthy()
    expect(copyId).not.toBe(id)
    expect(useLibrary.getState().rooms).toHaveLength(2)
    const copy = storage.docs.get(copyId!)!
    expect(copy.name).toBe("Mila's room (copy)")
    expect(copy.items).toHaveLength(8)
    expect(copy.group).toBe('Examples')
  })

  it('remove deletes the document, closing it if it was open', async () => {
    await useLibrary.getState().refresh()
    const id = await useLibrary.getState().create({ name: 'Temp' })
    expect(useLibrary.getState().currentId).toBe(id)
    await useLibrary.getState().remove(id)
    expect(useLibrary.getState().currentId).toBeNull()
    expect(storage.docs.has(id)).toBe(false)
    expect(useLibrary.getState().rooms.some((r) => r.id === id)).toBe(false)
  })

  it('exportDoc hands the document to the storage backend', async () => {
    await useLibrary.getState().refresh()
    const id = useLibrary.getState().rooms[0].id
    await useLibrary.getState().exportDoc(id)
    expect(storage.exported).toHaveLength(1)
    expect(storage.exported[0].id).toBe(id)
  })

  it('imports a document with the old singular room shape', async () => {
    await useLibrary.getState().refresh()
    storage.nextImport = {
      id: 'room-old',
      name: 'Old room',
      room: {
        name: 'Old room',
        w: 250,
        d: 300,
        h: 250,
        window: { wall: 'left', offset: 40, width: 100, height: 120, sill: 90 },
        door: { wall: 'right', offset: 20, width: 80, height: 205, sill: 0, hinge: 'left' },
        radiator: { wall: 'left', offset: 50, width: 80, depth: 10, height: 60 },
      },
      items: [{ id: 'bed', name: 'Bed', kind: 'bed', w: 140, d: 200, h: 50, x: 100, y: 120, rot: 0, color: '#fcc', inRoom: true }],
    }
    const id = await useLibrary.getState().importDoc()
    expect(id).toBe('room-old')
    expect(useLibrary.getState().currentId).toBe('room-old')
    const st = useStore.getState()
    expect(st.room.w).toBe(250)
    expect(st.room.name).toBe('Old room')
    expect(st.room.wallColors).toEqual(defaultRoom.wallColors)
    expect(st.items).toHaveLength(1)
    expect(st.savedLayouts).toEqual([])
    expect(storage.docs.get('room-old')!.version).toBe(DOC_VERSION)
    expect(useLibrary.getState().rooms.map((r) => r.name).sort()).toEqual(["Mila's room", 'Old room'])

    // an unreadable file is reported, not thrown
    storage.nextImport = { nothing: true }
    expect(await useLibrary.getState().importDoc()).toBeNull()
    expect(useLibrary.getState().error).toMatch(/not a Room Planner room/)
  })
})

describe('helpers', () => {
  it('roomOpenings returns the window and door lists', () => {
    const single = roomOpenings(defaultRoom)
    expect(single.windows).toHaveLength(1)
    expect(single.doors[0].hinge).toBe('right')
    const arrays = roomOpenings({ ...defaultRoom, windows: [defaultRoom.windows[0], defaultRoom.windows[0]], doors: [] })
    expect(arrays.windows).toHaveLength(2)
    expect(arrays.doors).toHaveLength(0)
  })

  it('timeAgo reads naturally', () => {
    const t = Date.parse('2026-09-24T12:00:00Z')
    expect(timeAgo('2026-09-24T11:59:50Z', t)).toBe('just now')
    expect(timeAgo('2026-09-24T11:30:00Z', t)).toBe('30 minutes ago')
    expect(timeAgo('2026-09-24T09:00:00Z', t)).toBe('3 hours ago')
    expect(timeAgo('2026-09-22T12:00:00Z', t)).toBe('2 days ago')
    expect(timeAgo('2026-06-24T12:00:00Z', t)).toBe('3 months ago')
    expect(timeAgo('nonsense', t)).toBe('')
  })
})

describe('share links', () => {
  it('start() turns a #hash share link into a "Shared room" document and clears the hash', async () => {
    const shared = { room: { ...defaultRoom, name: 'From a link', w: 280 }, items: [], s: { daytime: false } }
    const hash = '#' + btoa(encodeURIComponent(JSON.stringify(shared)))
    const g = globalThis as unknown as { location?: unknown; history?: unknown }
    const replaced: string[] = []
    g.location = { hash, pathname: '/planner', search: '?x=1' }
    g.history = { replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url) } }
    try {
      await useLibrary.getState().start()
      const lib = useLibrary.getState()
      expect(lib.currentId).toBeTruthy()
      const doc = storage.docs.get(lib.currentId!)!
      expect(doc.name).toBe('Shared room')
      expect(doc.group).toBe('Shared')
      expect(doc.room.w).toBe(280)
      expect(doc.settings.daytime).toBe(false)
      expect(useStore.getState().daytime).toBe(false)
      expect(replaced).toEqual(['/planner?x=1'])
      // the example room was seeded as well
      expect(lib.rooms.map((r) => r.group).sort()).toEqual(['Examples', 'Shared'])
      // start() is idempotent (StrictMode mounts twice)
      await useLibrary.getState().start()
      expect(storage.docs.size).toBe(2)
    } finally {
      delete g.location
      delete g.history
    }
  })
})
