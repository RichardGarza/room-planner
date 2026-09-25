import type { Item, Room } from '../types'
import type { Unit } from '../units'

export type Paper = 'letter' | 'a4'
export type Orientation = 'auto' | 'landscape' | 'portrait'
export type Product = 'plan' | 'kit'

/** A page size in millimetres. */
export interface PageSize {
  w: number
  h: number
}

/** One printed page: an SVG document string sized in millimetres. */
export interface Sheet {
  svg: string
  w: number
  h: number
  /** warnings worth showing next to the preview (items that did not fit, clipped room) */
  notes?: string[]
}

export interface SheetInput {
  room: Room
  items: Item[]
  unit: Unit
  /** room name shown in the title block (defaults to room.name) */
  title?: string
  group?: string
  /** date text for the title block; defaults to today */
  date?: string
}

export interface SheetOptions {
  paper: Paper
  orientation: Orientation
}

/** A rectangle in page millimetres. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}
