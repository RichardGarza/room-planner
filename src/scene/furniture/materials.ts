import * as THREE from 'three'
import { createContext, createElement, useContext, useMemo } from 'react'
import { isWoodTone } from './layout'

/* --------------------------- highlight + quality --------------------------- */

/** Per-item context: selection/hover tint, the quality setting and whether it is evening (lamps on). */
export interface Fx {
  emissive: string
  ei: number
  fast: boolean
  night: boolean
}
export const FxContext = createContext<Fx>({ emissive: '#000000', ei: 0, fast: false, night: false })
export const useFx = () => useContext(FxContext)

/* ------------------------------ canvas textures ---------------------------- */

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, srgb = true): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

const cache = new Map<string, THREE.Texture>()
function memo(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key)
  if (!t) { t = make(); cache.set(key, t) }
  return t
}

/** Light greyscale oak grain; tint it with the material colour. */
export const oakGrain = () =>
  memo('oak', () =>
    canvasTexture(256, (g, s) => {
      g.fillStyle = '#f0ebe4'
      g.fillRect(0, 0, s, s)
      let seed = 7
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      // long wavy grain lines running along x
      for (let i = 0; i < 90; i++) {
        const y = r() * s
        const amp = 2 + r() * 4
        const freq = 0.01 + r() * 0.03
        const alpha = 0.05 + r() * 0.12
        g.strokeStyle = `rgba(90,60,30,${alpha})`
        g.lineWidth = 0.6 + r() * 1.4
        g.beginPath()
        for (let x = 0; x <= s; x += 4) g.lineTo(x, y + Math.sin(x * freq + i) * amp)
        g.stroke()
      }
      // soft broad bands
      for (let i = 0; i < 6; i++) {
        const y = r() * s
        g.fillStyle = `rgba(120,80,40,${0.03 + r() * 0.04})`
        g.fillRect(0, y, s, 10 + r() * 30)
      }
    }),
  )

/** Fine weave bump for fabric (mattress, cushions, duvet). */
export const fabricBump = () =>
  memo('fabric', () =>
    canvasTexture(128, (g, s) => {
      g.fillStyle = '#808080'
      g.fillRect(0, 0, s, s)
      for (let y = 0; y < s; y += 2) {
        for (let x = 0; x < s; x += 2) {
          const v = ((x >> 1) + (y >> 1)) % 2 ? 150 : 110
          g.fillStyle = `rgb(${v},${v},${v})`
          g.fillRect(x, y, 2, 2)
        }
      }
    }, false),
  )

/** Woven rug pile: crossing threads with slight colour variation, tinted by the rug colour. */
export const rugWeave = () =>
  memo('rug', () =>
    canvasTexture(256, (g, s) => {
      g.fillStyle = '#e6e2dc'
      g.fillRect(0, 0, s, s)
      let seed = 3
      const r = () => ((seed = (seed * 48271) % 2147483647) / 2147483647)
      for (let y = 0; y < s; y += 4) {
        for (let x = 0; x < s; x += 4) {
          const v = 185 + Math.floor(r() * 70)
          g.fillStyle = `rgb(${v},${v - 4},${v - 8})`
          g.fillRect(x, y, 3, 3)
        }
      }
      g.strokeStyle = 'rgba(60,40,30,0.3)'
      g.lineWidth = 1
      for (let i = 0; i < s; i += 8) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke()
        g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke()
      }
    }),
  )

/** Vertical stripes for the fringe at the ends of a rectangular rug. */
export const fringeStripes = () =>
  memo('fringe', () =>
    canvasTexture(64, (g, s) => {
      g.fillStyle = '#f3efe8'
      g.fillRect(0, 0, s, s)
      g.fillStyle = 'rgba(80,60,40,0.35)'
      for (let x = 0; x < s; x += 4) g.fillRect(x, 0, 1.5, s)
    }),
  )

/** Clone of a shared texture with its own repeat, memoised per size. */
export function useTiled(base: () => THREE.Texture, rx: number, ry: number): THREE.Texture {
  return useMemo(() => {
    const t = base().clone()
    t.repeat.set(rx, ry)
    t.needsUpdate = true
    return t
  }, [base, rx, ry])
}

/* -------------------------------- materials -------------------------------- */

export type MatProps = { color: string; roughness?: number }

/** Semi-matt painted wood / laminate. */
export function Painted({ color, roughness = 0.55 }: MatProps) {
  const { emissive, ei } = useFx()
  return createElement('meshStandardMaterial', { color, roughness, metalness: 0.02, emissive, emissiveIntensity: ei })
}

/** Natural wood with procedural grain, tinted by `color`. */
export function Oak({ color = '#d8b98f', roughness = 0.6, tile = 1 }: Partial<MatProps> & { tile?: number }) {
  const { emissive, ei } = useFx()
  const map = useTiled(oakGrain, tile, tile)
  return createElement('meshStandardMaterial', { map, color, roughness, metalness: 0, emissive, emissiveIntensity: ei })
}

/** Painted or oak depending on the tone of the colour. */
export function Surface({ color, roughness, tile }: MatProps & { tile?: number }) {
  return isWoodTone(color) ? createElement(Oak, { color, roughness, tile }) : createElement(Painted, { color, roughness })
}

/** Upholstery, bedding, cushions: high roughness with a soft sheen. `glow` lights a lamp shade from inside, evenings only. */
export function Fabric({ color, sheen = 0.35, glow }: MatProps & { sheen?: number; glow?: string }) {
  const { emissive, ei, fast, night } = useFx()
  const bump = useTiled(fabricBump, 18, 18)
  const lit = night && glow
  return createElement('meshPhysicalMaterial', {
    color,
    roughness: 0.95,
    metalness: 0,
    sheen,
    sheenRoughness: 0.85,
    sheenColor: '#ffffff',
    bumpMap: fast ? null : bump,
    bumpScale: 0.012,
    emissive: lit ? glow : emissive,
    emissiveIntensity: lit ? 0.45 : ei,
  })
}

/** Warm bulb inside a lamp shade: lights the wall and floor beside it in the evening, off by day. */
export function Bulb({ at }: { at: [number, number, number] }) {
  const { night } = useFx()
  return createElement('pointLight', { position: at, intensity: night ? 1.2 : 0, distance: 2.5, decay: 2, color: '#ffd9a0', castShadow: false })
}

/** Brushed metal for handles, legs, lifts. */
export function Metal({ color = '#cfd3d8', roughness = 0.3 }: Partial<MatProps>) {
  const { emissive, ei } = useFx()
  return createElement('meshStandardMaterial', { color, roughness, metalness: 0.8, emissive, emissiveIntensity: ei })
}

/** Dark matte plastic (chair shells, laptop). */
export function Plastic({ color = '#3a3d42', roughness = 0.45 }: Partial<MatProps>) {
  const { emissive, ei } = useFx()
  return createElement('meshStandardMaterial', { color, roughness, metalness: 0.1, emissive, emissiveIntensity: ei })
}

/** Glossy lacquer (piano). */
export function Lacquer({ color, roughness = 0.18 }: MatProps) {
  const { emissive, ei } = useFx()
  return createElement('meshPhysicalMaterial', { color, roughness, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.15, emissive, emissiveIntensity: ei })
}
