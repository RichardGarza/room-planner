import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { Item } from '../../types'
import { cm } from '../util'
import { hashSeed, mix, rng, shade } from './layout'
import { Painted, useFx } from './materials'

/**
 * Indoor plants built from primitives: a tapered pot with a rim and a soil disc, a trunk of
 * leaning cylinder segments with a few branches, and foliage as instanced leaf planes. Every
 * plant is seeded by its item id, so two olive trees differ but each one stays the same between
 * renders. The model (`buildPlant`) has no React in it, so the rules can be unit-tested. The
 * item box is the canopy: `w` × `d` is how wide the leaves spread, `h` the total height.
 */

/* --------------------------------- variants -------------------------------- */

export type PlantVariant = 'olive' | 'fig' | 'shrub' | 'snake' | 'palm' | 'monstera'
export type LeafShape = 'olive' | 'round' | 'fig' | 'sword' | 'frond' | 'monstera'

/** Which plant a preset (or a custom item) is, from its name; unnamed tall things are trees, short ones shrubs. */
export function plantVariant(name: string, w = 60, h = 100): PlantVariant {
  const n = name.toLowerCase()
  if (n.includes('olive')) return 'olive'
  if (n.includes('fig') || n.includes('ficus')) return 'fig'
  if (n.includes('snake') || n.includes('sansevieria')) return 'snake'
  if (n.includes('palm')) return 'palm'
  if (n.includes('monstera')) return 'monstera'
  if (n.includes('shrub') || n.includes('bush') || n.includes('hedge')) return 'shrub'
  return h >= w * 2 ? 'olive' : 'shrub'
}

/** Terracotta for the trees, matte white for the houseplants, rattan for the palm, stone for the shrubs. */
export function potColour(variant: PlantVariant): string {
  switch (variant) {
    case 'olive': case 'fig': return '#b8654a'
    case 'snake': case 'monstera': return '#f1ece4'
    case 'palm': return '#c9a97a'
    default: return '#8d8a85'
  }
}

/** Bark colour (the monstera has green stems instead). */
export function barkColour(variant: PlantVariant): string {
  switch (variant) {
    case 'olive': return '#8a7d6b'
    case 'fig': return '#7a6652'
    case 'palm': return '#8b7355'
    case 'monstera': return '#4c7a3e'
    default: return '#6e5a44'
  }
}

/** Leaf colours from the item colour: olive, fig and monstera leaves have a different back, the rest are the same both sides. */
export function leafColours(variant: PlantVariant, color: string): { front: string; back: string | null; roughness: number } {
  switch (variant) {
    case 'olive': return { front: mix(color, '#a3ad8e', 0.4), back: mix(color, '#eef1e6', 0.72), roughness: 0.75 }
    case 'fig': return { front: shade(color, 0.85), back: mix(color, '#ffffff', 0.15), roughness: 0.35 }
    case 'monstera': return { front: shade(color, 0.82), back: mix(color, '#ffffff', 0.12), roughness: 0.35 }
    case 'snake': return { front: shade(color, 0.85), back: null, roughness: 0.7 }
    case 'palm': return { front: color, back: null, roughness: 0.6 }
    default: return { front: color, back: null, roughness: 0.85 }
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Leaves (or fronds) per plant, sizes in cm; fewer on the fast quality setting. Stable for a given size. */
export function leafCount(variant: PlantVariant, w: number, h: number, fast: boolean): number {
  const area = (w / 100) * (h / 100)
  let n: number
  switch (variant) {
    case 'olive': n = clamp(Math.round(110 * clamp(area / 0.9, 0.6, 1.6)), 40, 120); break
    case 'shrub': n = clamp(Math.round(100 * clamp(area / 1.1, 0.5, 1.5)), 40, 120); break
    case 'fig': n = clamp(Math.round(16 * clamp(area / 1.26, 0.6, 1.6)), 10, 26); break
    case 'snake': n = clamp(Math.round(14 * clamp(w / 30, 0.5, 2.5)), 6, 30); break
    case 'palm': n = clamp(Math.round(9 * clamp(w / 90, 0.6, 1.6)), 6, 14); break
    case 'monstera': n = clamp(Math.round(10 * clamp(w / 80, 0.6, 1.6)), 6, 16); break
  }
  if (!fast) return n
  const dense = variant === 'olive' || variant === 'shrub'
  return Math.max(dense ? 20 : 5, Math.round(n * (dense ? 0.5 : 0.7)))
}

/* ---------------------------------- model ---------------------------------- */

type V3 = [number, number, number]
type Quat = [number, number, number, number]

/** A cylinder from its bottom (radius r0) to its top (r1), positioned by its centre and turned to lie along the segment. */
export interface WoodPiece { at: V3; quat: Quat; len: number; r0: number; r1: number; dark?: boolean }
/** One leaf plane: its world matrix (base at the origin, length along +y, width along x) and a brightness factor. */
export interface LeafPlacement { matrix: number[]; tone: number }
export interface PlantModel {
  variant: PlantVariant
  pot: { r: number; h: number }
  soilY: number
  wood: WoodPiece[]
  /** bulges at the joints of a gnarled trunk */
  knots: { at: V3; quat: Quat; scale: V3 }[]
  /** solid ellipsoid inside a dense canopy so it is not see-through */
  body: { at: V3; scale: V3 } | null
  leaves: LeafPlacement[]
  leafShape: LeafShape
}

const UP = new THREE.Vector3(0, 1, 0)
const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z]
const dirFrom = (az: number, el: number) => new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el))
const randomDir = (rnd: () => number, elMin = -Math.PI / 2, elMax = Math.PI / 2) => dirFrom(rnd() * Math.PI * 2, elMin + rnd() * (elMax - elMin))

function piece(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, dark?: boolean): WoodPiece {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize())
  const at = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  const p: WoodPiece = { at: v3(at), quat: [q.x, q.y, q.z, q.w], len, r0, r1 }
  if (dark) p.dark = true
  return p
}

/** A leaf with its base at `at`, its length along `dir` and its face turned toward `up`, sized len × wid. */
function leaf(at: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3, len: number, wid: number, tone: number): LeafPlacement {
  const y = dir.clone().normalize()
  const z = up.clone().sub(y.clone().multiplyScalar(up.dot(y)))
  if (z.lengthSq() < 1e-6) z.set(1, 0, 0).sub(y.clone().multiplyScalar(y.x))
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1)
  z.normalize()
  const x = new THREE.Vector3().crossVectors(y, z)
  const m = new THREE.Matrix4().makeBasis(x, y, z)
  m.scale(new THREE.Vector3(wid, len, 1))
  m.setPosition(at)
  return { matrix: m.toArray(), tone }
}

/** Pull a point back inside an ellipsoid (semi-axes `semi` about `c`). */
function keepInside(p: THREE.Vector3, c: THREE.Vector3, semi: V3, margin = 0.98): THREE.Vector3 {
  const nx = (p.x - c.x) / semi[0], ny = (p.y - c.y) / semi[1], nz = (p.z - c.z) / semi[2]
  const r = Math.sqrt(nx * nx + ny * ny + nz * nz)
  if (r > margin) {
    const k = margin / r
    p.set(c.x + nx * k * semi[0], c.y + ny * k * semi[1], c.z + nz * k * semi[2])
  }
  return p
}

/** A leaning trunk of `segs` cylinders from the soil up to `topY`, wandering back toward the middle; returns the joints. */
function trunk(rnd: () => number, wood: WoodPiece[], soilY: number, topY: number, r: number, segs: number, lean: [number, number], taper: number): { joints: THREE.Vector3[]; r: number } {
  let p = new THREE.Vector3((rnd() - 0.5) * 0.03, soilY, (rnd() - 0.5) * 0.03)
  const joints = [p.clone()]
  for (let i = 0; i < segs; i++) {
    const dir = randomDir(rnd, Math.PI / 2 - lean[1], Math.PI / 2 - lean[0])
    dir.x -= p.x * 1.5
    dir.z -= p.z * 1.5
    dir.normalize()
    const q = p.clone().add(dir.multiplyScalar((topY - soilY) / segs))
    const r1 = r * taper * (0.95 + rnd() * 0.1)
    wood.push(piece(p, q, i === 0 ? r * 1.25 : r * 1.05, r1))
    p = q
    r = r1
    joints.push(p.clone())
  }
  return { joints, r }
}

/** The whole plant for an item, in metres, deterministic for the id and size. */
export function buildPlant(id: string, variant: PlantVariant, wcm: number, dcm: number, hcm: number, fast: boolean): PlantModel {
  const rnd = rng(hashSeed(id))
  const w = cm(wcm), d = cm(dcm), h = cm(hcm)
  const count = leafCount(variant, wcm, hcm, fast)
  const wood: WoodPiece[] = []
  const knots: PlantModel['knots'] = []
  const leaves: LeafPlacement[] = []
  let body: PlantModel['body'] = null
  let leafShape: LeafShape = 'round'
  const potRatio = { olive: 0.45, fig: 0.45, palm: 0.4, monstera: 0.5, shrub: 0.55, snake: 0.8 }[variant]
  const potFrac = variant === 'olive' || variant === 'fig' ? 0.2 : variant === 'palm' ? 0.18 : 0.27
  const potH = clamp(h * potFrac, 0.12, 0.4)
  const potR = Math.max(0.06, (Math.min(w, d) / 2) * potRatio)
  const soilY = potH - 0.025
  const reach = (Math.min(w, d) / 2) * 0.95

  switch (variant) {
    case 'olive': {
      // gnarled standard: a leaning trunk that thickens at the joints, branches and twigs ending in
      // clusters of narrow leaves that fill the canopy ellipsoid
      leafShape = 'olive'
      const s = clamp(Math.sqrt((w * h) / 0.9), 0.75, 1.8)
      const leafLen = 0.11 * s
      const trunkTop = potH + (h - potH) * 0.4
      const semi: V3 = [Math.max(0.05, w / 2 - leafLen * 0.35), (h - trunkTop) / 2, Math.max(0.05, d / 2 - leafLen * 0.35)]
      const centre = new THREE.Vector3(0, trunkTop + (h - trunkTop) / 2, 0)
      const t = trunk(rnd, wood, soilY, trunkTop, 0.034 * s, 3, [0.08, 0.22], 0.82)
      for (let i = 1; i < t.joints.length - 1; i++) {
        const k = wood[i]
        const r = k.r0
        knots.push({ at: v3(t.joints[i]), quat: k.quat, scale: [r * 1.5, r * 1.1, r * 1.5] })
      }
      const top = t.joints[t.joints.length - 1]
      const clusters: THREE.Vector3[] = []
      const nb = 3 + Math.floor(rnd() * 3)
      const span = Math.min(semi[0], semi[2])
      for (let b = 0; b < nb; b++) {
        const start = b < 3 ? top.clone() : t.joints[t.joints.length - 2].clone().lerp(top, 0.3 + rnd() * 0.5)
        const dir = dirFrom((b / nb) * Math.PI * 2 + rnd() * 1.2, 0.45 + rnd() * 0.5)
        const len = span * (0.55 + rnd() * 0.4)
        const end = keepInside(start.clone().add(dir.clone().multiplyScalar(len)), centre, semi, 0.9)
        wood.push(piece(start, end, t.r * 0.8, t.r * 0.3))
        clusters.push(end)
        for (let k = 0; k < 2; k++) {
          const from = start.clone().lerp(end, 0.5 + rnd() * 0.4)
          const tdir = dir.clone().multiplyScalar(0.7).add(randomDir(rnd, 0, 1)).normalize()
          const tend = keepInside(from.clone().add(tdir.multiplyScalar(len * (0.35 + rnd() * 0.35))), centre, semi, 0.95)
          wood.push(piece(from, tend, t.r * 0.28, 0.004 * s))
          clusters.push(tend)
        }
      }
      const spread = span * 0.36
      for (let i = 0; i < count; i++) {
        const c = clusters[i % clusters.length]
        const at = keepInside(c.clone().add(randomDir(rnd).multiplyScalar(Math.sqrt(rnd()) * spread)), centre, semi)
        const dir = at.clone().sub(c)
        dir.y += spread * 0.35
        if (dir.lengthSq() < 1e-4) dir.copy(randomDir(rnd))
        const len = leafLen * (0.8 + rnd() * 0.4)
        leaves.push(leaf(at, dir, randomDir(rnd), len, len * (0.26 + rnd() * 0.1), 0.85 + rnd() * 0.3))
      }
      break
    }
    case 'fig': {
      // fiddle-leaf fig: a slim straight trunk, a few upright branches, big leaves turned outward
      leafShape = 'fig'
      const s = clamp(Math.sqrt((w * h) / 1.26), 0.7, 1.6)
      const leafLen = clamp(0.3 * s, 0.18, 0.42)
      const trunkTop = potH + (h - potH) * 0.55
      const t = trunk(rnd, wood, soilY, trunkTop, 0.022 * s, 2, [0.02, 0.08], 0.8)
      const top = t.joints[t.joints.length - 1]
      const nb = 3 + Math.floor(rnd() * 3)
      const branches: [THREE.Vector3, THREE.Vector3][] = []
      for (let b = 0; b < nb; b++) {
        const start = t.joints[1].clone().lerp(top, 0.3 + rnd() * 0.7)
        const dir = dirFrom((b / nb) * Math.PI * 2 + rnd(), 0.85 + rnd() * 0.4)
        const len = Math.min((h - start.y - leafLen * 0.4) / Math.max(0.3, dir.y), (reach - leafLen * 0.3) / Math.max(0.2, Math.hypot(dir.x, dir.z))) * (0.6 + rnd() * 0.35)
        const end = start.clone().add(dir.multiplyScalar(Math.max(0.1, len)))
        wood.push(piece(start, end, t.r * 0.7, 0.006 * s))
        branches.push([start, end])
      }
      for (let i = 0; i < count; i++) {
        const [a, b] = branches[i % nb]
        const at = a.clone().lerp(b, 0.3 + rnd() * 0.7)
        const radial = new THREE.Vector3(at.x, 0, at.z)
        if (radial.lengthSq() < 1e-4) radial.copy(dirFrom(rnd() * Math.PI * 2, 0))
        radial.normalize()
        const dir = radial.clone().add(new THREE.Vector3(0, 0.15 + rnd() * 0.45, 0))
        const up = UP.clone().add(radial.clone().multiplyScalar(0.5 + rnd() * 0.4))
        // shorten a leaf that would poke out of the box
        let len = leafLen * (0.85 + rnd() * 0.3)
        const tip = at.clone().add(dir.clone().normalize().multiplyScalar(len))
        const over = Math.max(Math.abs(tip.x) / (w / 2), Math.abs(tip.z) / (d / 2), tip.y / h)
        if (over > 1) len /= over
        leaves.push(leaf(at, dir, up, len, len * 0.62, 0.85 + rnd() * 0.25))
      }
      break
    }
    case 'shrub': {
      // dense rounded canopy sitting on the pot: a solid ellipsoid dressed with small leaves
      leafShape = 'round'
      const canopyH = h - potH + 0.05
      const leafLen = clamp(0.07 * Math.sqrt(Math.min(w, d) / 0.7), 0.045, 0.12)
      const centre = new THREE.Vector3(0, potH - 0.05 + canopyH / 2, 0)
      const semi: V3 = [Math.max(0.05, w / 2 - leafLen * 0.45), canopyH / 2, Math.max(0.05, d / 2 - leafLen * 0.45)]
      body = { at: v3(centre), scale: [semi[0] * 0.9, semi[1] * 0.9, semi[2] * 0.9] }
      for (let i = 0; i < count; i++) {
        const n = randomDir(rnd, -1.2, Math.PI / 2) // not from the underside
        const k = 0.8 + rnd() * 0.18
        const at = new THREE.Vector3(centre.x + n.x * semi[0] * k, centre.y + n.y * semi[1] * k, centre.z + n.z * semi[2] * k)
        const dir = n.clone().add(randomDir(rnd).multiplyScalar(0.6))
        const len = leafLen * (0.8 + rnd() * 0.4)
        leaves.push(leaf(at, dir, randomDir(rnd), len, len * 0.6, 0.8 + rnd() * 0.35))
      }
      break
    }
    case 'snake': {
      // upright sword leaves straight out of the soil, leaning a little outward
      leafShape = 'sword'
      for (let i = 0; i < count; i++) {
        const az = (i / count) * Math.PI * 2 + rnd() * 0.9
        const rad = Math.sqrt(rnd()) * potR * 0.6
        const base = new THREE.Vector3(Math.cos(az) * rad, soilY, Math.sin(az) * rad)
        const len = (h - soilY) * (0.55 + rnd() * 0.45)
        const tilt = Math.min(0.06 + rnd() * 0.24, Math.asin(clamp((reach - rad) / len, 0, 1)))
        const dir = dirFrom(az + (rnd() - 0.5) * 0.6, Math.PI / 2 - tilt)
        const face = dirFrom(az + Math.PI / 2 + (rnd() - 0.5) * 0.8, 0)
        const wid = clamp(Math.min(w, d) * 0.28, 0.035, 0.1) * (0.8 + rnd() * 0.4)
        leaves.push(leaf(base, dir, face, len, wid, 0.8 + rnd() * 0.45))
      }
      break
    }
    case 'palm': {
      // ringed trunk with a crown of drooping fronds and a couple of young ones standing up
      leafShape = 'frond'
      const s = clamp(Math.sqrt((w * h) / 1.53), 0.7, 1.6)
      const crownY = potH + (h - potH) * 0.55
      const t = trunk(rnd, wood, soilY, crownY, 0.042 * s, 2, [0.03, 0.1], 0.85)
      if (!fast) {
        for (let i = 0; i < 2; i++) {
          const a = t.joints[i], b = t.joints[i + 1], r = wood[i].r0 * 1.1
          for (let k = 0; k < 3; k++) {
            const t0 = (k + 0.25) / 3
            wood.push(piece(a.clone().lerp(b, t0), a.clone().lerp(b, t0 + 0.06), r, r, true))
          }
        }
      }
      const crown = t.joints[t.joints.length - 1]
      for (let i = 0; i < count; i++) {
        const young = i >= count - 2
        const az = (i / count) * Math.PI * 2 + rnd() * 0.6
        const el = young ? 1.0 + rnd() * 0.3 : -0.1 + rnd() * 0.55
        let len = young ? reach * 0.6 : (reach * (0.8 + rnd() * 0.2)) / Math.max(0.35, Math.cos(el))
        if (el > 0 && crown.y + Math.sin(el) * len > h) len = (h - crown.y) / Math.sin(el)
        const up = UP.clone().add(dirFrom(az, 0).multiplyScalar(0.25))
        leaves.push(leaf(crown, dirFrom(az, el), up, len, len * 0.26, 0.85 + rnd() * 0.3))
      }
      break
    }
    case 'monstera': {
      // thick green stems fanning out of the pot, each carrying one big split leaf
      leafShape = 'monstera'
      const s = clamp(Math.sqrt((w * h) / 0.96), 0.7, 1.6)
      const leafLen = clamp(Math.min(w, d) * 0.42, 0.16, 0.5)
      for (let i = 0; i < count; i++) {
        const az = (i / count) * Math.PI * 2 + rnd() * 0.7
        const rad = Math.sqrt(rnd()) * potR * 0.5
        const base = new THREE.Vector3(Math.cos(az) * rad, soilY, Math.sin(az) * rad)
        const el = 0.55 + rnd() * 0.7
        // the stem stops where the leaf still has room to lie over the footprint; a cramped leaf tilts up instead
        let stem = Math.min((h - soilY) * (0.35 + rnd() * 0.45), (reach - rad - leafLen * 0.15) / Math.cos(el))
        const len = leafLen * (0.85 + rnd() * 0.3)
        const room = reach - rad - Math.cos(el) * stem
        const leafEl = Math.acos(clamp(room / len, 0.12, 0.92)) * (0.85 + rnd() * 0.15)
        const top = base.y + Math.sin(el) * stem + Math.sin(leafEl) * len
        if (top > h - 0.02) stem -= (top - h + 0.02) / Math.sin(el)
        stem = Math.max(0.08, stem)
        const end = base.clone().add(dirFrom(az + (rnd() - 0.5) * 0.4, el).multiplyScalar(stem))
        wood.push(piece(base, end, 0.013 * s, 0.009 * s))
        const up = UP.clone().add(dirFrom(az, 0).multiplyScalar(0.35))
        leaves.push(leaf(end, dirFrom(az + (rnd() - 0.5) * 0.3, leafEl), up, len, len * 0.85 * (0.85 + rnd() * 0.3), 0.85 + rnd() * 0.2))
      }
      break
    }
  }
  return { variant, pot: { r: potR, h: potH }, soilY, wood, knots, body, leaves, leafShape }
}

/* ------------------------------- leaf shapes ------------------------------- */

/** Outline from a half-width profile over t (0 = base, 1 = tip), mirrored; `notch` lifts the base point for a heart shape. */
function polyShape(halfWidth: (t: number) => number, t0: number, steps: number, notch = t0): THREE.Shape {
  const s = new THREE.Shape()
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = t0 + (1 - t0) * (i / steps)
    pts.push([Math.max(0, halfWidth(t)), t])
  }
  s.moveTo(0, notch)
  for (const [x, y] of pts) if (x > 1e-4) s.lineTo(x, y)
  s.lineTo(0, 1)
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i][0] > 1e-4) s.lineTo(-pts[i][0], pts[i][1])
  s.closePath()
  return s
}

function outline(kind: LeafShape): THREE.Shape {
  switch (kind) {
    case 'olive': return polyShape((t) => 0.5 * Math.pow(Math.sin(Math.PI * t), 0.8), 0, 12)
    case 'round': return polyShape((t) => 0.5 * Math.pow(Math.sin(Math.PI * t), 0.55), 0, 10)
    // fiddle: broad and rounded with a waist
    case 'fig': return polyShape((t) => 0.5 * Math.pow(Math.sin(Math.PI * t), 0.45) * (1 - 0.22 * Math.exp(-(((t - 0.45) / 0.14) ** 2))), 0, 24)
    // sword: already wide at the base, pointed tip
    case 'sword': return polyShape((t) => 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.9)), 0.6), 0, 16)
    // frond: a narrow stalk, then a sawtooth edge standing in for the leaflets
    case 'frond': return polyShape((t) => {
      const base = 0.5 * Math.pow(Math.sin(Math.PI * t), 0.5)
      if (t < 0.1) return base * 0.35
      return base * (0.45 + 0.55 * Math.abs(((t * 18) % 1) * 2 - 1))
    }, 0, 72)
    // monstera: a heart with lobes below the stem and three splits down each side
    case 'monstera': return polyShape((t) => {
      const u = (t + 0.28) / 1.28
      let hw = Math.max(0.5 * Math.pow(Math.sin(Math.PI * u), 0.6), 0.14 * (1 - u * 3))
      for (const c of [0.25, 0.5, 0.75]) {
        const dd = Math.abs(t - c)
        if (dd < 0.055) hw *= 0.4 + 0.6 * (dd / 0.055)
      }
      return hw
    }, -0.28, 40, -0.1)
  }
}

const shapes = new Map<LeafShape, THREE.BufferGeometry>()
/** Flat leaf outline 1 long along +y from its base at the origin and at most 1 wide; shared by every plant. */
export function leafGeometry(kind: LeafShape): THREE.BufferGeometry {
  let g = shapes.get(kind)
  if (!g) {
    g = new THREE.ShapeGeometry(outline(kind), 4)
    shapes.set(kind, g)
  }
  return g
}

/* -------------------------------- component -------------------------------- */

/** One instanced batch of leaf planes, each a tone of `color`. Leaves cast shadows but do not receive them. */
function LeafBatch({ leaves, geometry, color, side, roughness }: { leaves: LeafPlacement[]; geometry: THREE.BufferGeometry; color: string; side: THREE.Side; roughness: number }) {
  const { emissive, ei } = useFx()
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = leaves.length
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const mat = new THREE.Matrix4(), c = new THREE.Color(), base = new THREE.Color(color)
    leaves.forEach((l, i) => {
      m.setMatrixAt(i, mat.fromArray(l.matrix))
      m.setColorAt(i, c.copy(base).multiplyScalar(l.tone))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [leaves, color])
  if (count === 0) return null
  return (
    <instancedMesh key={count} ref={ref} args={[undefined, undefined, count]} geometry={geometry} castShadow receiveShadow={false}>
      <meshStandardMaterial color="#ffffff" roughness={roughness} metalness={0} side={side} emissive={emissive} emissiveIntensity={ei} />
    </instancedMesh>
  )
}

/** Potted plant: pot, trunk and branches as cylinders, leaves as instanced planes; memoised per size and seeded by the item id. */
export function PlantItem({ item }: { item: Item }) {
  const { fast } = useFx()
  const variant = plantVariant(item.name, item.w, item.h)
  const model = useMemo(() => buildPlant(item.id, variant, item.w, item.d, item.h, fast), [item.id, variant, item.w, item.d, item.h, fast])
  const seg = fast ? 8 : 16
  const pot = potColour(variant)
  const bark = barkColour(variant)
  const { front, back, roughness } = leafColours(variant, item.color)
  const geometry = leafGeometry(model.leafShape)
  const rimH = Math.min(0.04, model.pot.h * 0.14)
  const potRough = pot === '#f1ece4' ? 0.92 : 0.85
  return (
    <>
      <mesh position={[0, model.pot.h / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[model.pot.r, model.pot.r * 0.72, model.pot.h, seg]} />
        <Painted color={pot} roughness={potRough} />
      </mesh>
      <mesh position={[0, model.pot.h - rimH / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[model.pot.r * 1.07, model.pot.r * 1.07, rimH, seg]} />
        <Painted color={shade(pot, 0.94)} roughness={potRough} />
      </mesh>
      <mesh position={[0, model.soilY, 0]} receiveShadow>
        <cylinderGeometry args={[model.pot.r * 0.95, model.pot.r * 0.95, 0.012, seg]} />
        <Painted color="#4a3a2c" roughness={1} />
      </mesh>
      {model.wood.map((p, i) => (
        <mesh key={i} position={p.at} quaternion={p.quat} castShadow>
          <cylinderGeometry args={[p.r1, p.r0, p.len, p.r0 > 0.015 ? seg : 6]} />
          <Painted color={p.dark ? shade(bark, 0.72) : bark} roughness={0.95} />
        </mesh>
      ))}
      {!fast && model.knots.map((k, i) => (
        <mesh key={i} position={k.at} quaternion={k.quat} scale={k.scale} castShadow>
          <sphereGeometry args={[1, 8, 6]} />
          <Painted color={shade(bark, 0.9)} roughness={0.95} />
        </mesh>
      ))}
      {model.body && (
        <mesh position={model.body.at} scale={model.body.scale} castShadow>
          <sphereGeometry args={[1, seg, Math.round(seg * 0.7)]} />
          <Painted color={shade(item.color, 0.62)} roughness={0.95} />
        </mesh>
      )}
      {back ? (
        <>
          <LeafBatch leaves={model.leaves} geometry={geometry} color={front} side={THREE.FrontSide} roughness={roughness} />
          <LeafBatch leaves={model.leaves} geometry={geometry} color={back} side={THREE.BackSide} roughness={roughness} />
        </>
      ) : (
        <LeafBatch leaves={model.leaves} geometry={geometry} color={front} side={THREE.DoubleSide} roughness={roughness} />
      )}
    </>
  )
}
