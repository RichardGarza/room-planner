import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** centimetres → metres */
export const cm = (v: number) => v / 100
export const WALL_T = 0.12

export function shadeColor(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 255) * f), g = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f)
  return `rgb(${r | 0},${g | 0},${b | 0})`
}

/** Small deterministic PRNG so procedural detail is stable between renders. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** A box: centre x, y, z then width, height, depth. */
export type BoxSpec = [number, number, number, number, number, number]

/** Many boxes merged into one geometry (one draw call). */
export function mergedBoxes(boxes: BoxSpec[]): THREE.BufferGeometry {
  const parts = boxes.map(([x, y, z, w, h, d]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z))
  const merged = parts.length ? mergeGeometries(parts, false) : new THREE.BufferGeometry()
  parts.forEach((p) => p.dispose())
  return merged
}

/**
 * A box whose texture coordinates are in metres, so a tiling texture keeps the same
 * physical scale on every piece whatever its size.
 */
export function worldUvBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  // BoxGeometry vertex order: +x, -x, +y, -y, +z, -z faces, 4 vertices each.
  const scales: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let i = 0; i < 24; i++) {
    const [sx, sy] = scales[Math.floor(i / 4)]
    uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy)
  }
  uv.needsUpdate = true
  return g
}

/**
 * A moulding profile (points in the wall's z/y plane, z into the room) extruded
 * along the wall's local x axis from `a` to `b`.
 */
export function profileAlongX(profile: [number, number][], a: number, b: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, b - a), bevelEnabled: false, curveSegments: 6 })
  g.rotateY(-Math.PI / 2) // extrusion (0..L along +z) now runs along -x, profile z points into the room
  g.translate(b, 0, 0)
  g.computeVertexNormals()
  return g
}

/** Points of a five-pointed star, radius r. */
export function starShape(r: number): THREE.Shape {
  const s = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad
    if (i === 0) s.moveTo(x, y)
    else s.lineTo(x, y)
  }
  s.closePath()
  return s
}
