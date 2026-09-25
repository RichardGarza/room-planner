import { describe, expect, it } from 'vitest'
import { CARDS_KEY, SIDEBAR_KEY, cardOpen, loadFlags, loadSidebar, parseFlags, parseSidebar, saveFlags, saveSidebar, type StorageLike } from '../components/Collapse'

/** an in-memory stand-in for localStorage */
function memory(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v } }
}

describe('card open/closed state', () => {
  it('reads only boolean entries and survives junk', () => {
    expect(parseFlags(null)).toEqual({})
    expect(parseFlags('')).toEqual({})
    expect(parseFlags('not json')).toEqual({})
    expect(parseFlags('[1,2]')).toEqual({})
    expect(parseFlags('{"room":false,"palette":true,"x":"yes","y":1}')).toEqual({ room: false, palette: true })
  })
  it('falls back to the default a card was given', () => {
    const flags = { room: true, checks: false }
    expect(cardOpen(flags, 'room', false)).toBe(true)
    expect(cardOpen(flags, 'checks')).toBe(false)
    expect(cardOpen(flags, 'layout')).toBe(true)
    expect(cardOpen(flags, 'room.doors', false)).toBe(false)
  })
  it('round-trips through storage under its own key', () => {
    const s = memory()
    saveFlags(CARDS_KEY, { room: false, 'room.doors': true }, s)
    expect(Object.keys(s.data)).toEqual([CARDS_KEY])
    expect(loadFlags(CARDS_KEY, s)).toEqual({ room: false, 'room.doors': true })
    expect(loadFlags(CARDS_KEY, null)).toEqual({})
  })
  it('ignores a storage that throws', () => {
    const bad: StorageLike = { getItem: () => { throw new Error('private mode') }, setItem: () => { throw new Error('private mode') } }
    expect(loadFlags(CARDS_KEY, bad)).toEqual({})
    expect(() => saveFlags(CARDS_KEY, { a: true }, bad)).not.toThrow()
  })
})

describe('side panel state', () => {
  it('is open unless it was collapsed', () => {
    expect(parseSidebar(null)).toBe(true)
    expect(parseSidebar('open')).toBe(true)
    expect(parseSidebar('garbage')).toBe(true)
    expect(parseSidebar('collapsed')).toBe(false)
  })
  it('round-trips through storage', () => {
    const s = memory()
    saveSidebar(false, s)
    expect(s.data[SIDEBAR_KEY]).toBe('collapsed')
    expect(loadSidebar(s)).toBe(false)
    saveSidebar(true, s)
    expect(loadSidebar(s)).toBe(true)
    expect(loadSidebar(null)).toBe(true)
  })
})
