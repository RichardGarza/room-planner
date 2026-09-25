import { describe, expect, it } from 'vitest'
import { runChecks } from '../checks'
import { intersects, rectOf } from '../geometry'
import { forestsRoom, inch } from '../seeds'

describe("Forest's Room seed", () => {
  const doc = forestsRoom()

  it('converts inches to whole centimetres', () => {
    expect(inch(141)).toBe(358)
    expect(inch(96)).toBe(244)
    expect(doc.room.w).toBe(358)
    expect(doc.room.d).toBe(295)
  })

  it('keeps every placed piece inside the room with no overlaps', () => {
    const placed = doc.items.filter((i) => i.inRoom)
    for (const it of placed) {
      const r = rectOf(it)
      expect(r.x0, it.name).toBeGreaterThanOrEqual(-0.5)
      expect(r.y0, it.name).toBeGreaterThanOrEqual(-0.5)
      expect(r.x1, it.name).toBeLessThanOrEqual(doc.room.w + 0.5)
      expect(r.y1, it.name).toBeLessThanOrEqual(doc.room.d + 0.5)
    }
    for (let a = 0; a < placed.length; a++)
      for (let b = a + 1; b < placed.length; b++)
        expect(intersects(rectOf(placed[a]), rectOf(placed[b])), `${placed[a].name} vs ${placed[b].name}`).toBe(false)
  })

  it('starts with no red checks and the dresser fitting under the window', () => {
    const checks = runChecks(doc.room, doc.items)
    const bad = checks.filter((c) => c.level === 'bad').map((c) => c.text)
    expect(bad).toEqual([])
    expect(checks.some((c) => c.level === 'ok' && /Dresser fits under the window/.test(c.text))).toBe(true)
  })

  it('keeps the reclined recliner parked outside the room', () => {
    const open = doc.items.find((i) => i.id === 'forest-recliner-open')!
    expect(open.inRoom).toBe(false)
    expect(open.d).toBe(inch(64))
  })
})
