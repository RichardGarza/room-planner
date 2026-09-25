import * as THREE from 'three'
import { seeded } from './util'

/* ------------------------------------------------------------------------ */
/*  Procedural canvas textures: plaster, ceiling, oak planks, fabric, sky.   */
/*  Everything is generated once per key and cached for the session.        */
/* ------------------------------------------------------------------------ */

const cache = new Map<string, unknown>()
function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key) as T
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

function dataTexture(data: Uint8Array, w: number, h: number, srgb = false) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/** Tileable value noise in [0,1], `cells` lattice points across a `size` square. */
function valueNoise(size: number, cells: number, seed: number): Float32Array {
  const rnd = seeded(seed)
  const lattice = new Float32Array(cells * cells)
  for (let i = 0; i < lattice.length; i++) lattice[i] = rnd()
  const out = new Float32Array(size * size)
  const step = size / cells
  for (let y = 0; y < size; y++) {
    const fy = y / step, y0 = Math.floor(fy), ty = fy - y0
    const sy = ty * ty * (3 - 2 * ty)
    for (let x = 0; x < size; x++) {
      const fx = x / step, x0 = Math.floor(fx), tx = fx - x0
      const sx = tx * tx * (3 - 2 * tx)
      const a = lattice[(y0 % cells) * cells + (x0 % cells)]
      const b = lattice[(y0 % cells) * cells + ((x0 + 1) % cells)]
      const c = lattice[((y0 + 1) % cells) * cells + (x0 % cells)]
      const d = lattice[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)]
      out[y * size + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy
    }
  }
  return out
}

/** Several octaves of tileable noise, normalised to roughly [0,1]. */
function fbm(size: number, baseCells: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size)
  let amp = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, baseCells << o, seed + o * 31)
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp
    total += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

/** Tangent-space normal map from a tileable height field. */
function normalFromHeight(h: Float32Array, w: number, hh: number, strength: number): Uint8Array {
  const out = new Uint8Array(w * hh * 4)
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const l = h[y * w + ((x - 1 + w) % w)], r = h[y * w + ((x + 1) % w)]
      const u = h[((y - 1 + hh) % hh) * w + x], d = h[((y + 1) % hh) * w + x]
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len; ny /= len; nz /= len
      const i = (y * w + x) * 4
      out[i] = (nx * 0.5 + 0.5) * 255
      out[i + 1] = (ny * 0.5 + 0.5) * 255
      out[i + 2] = (nz * 0.5 + 0.5) * 255
      out[i + 3] = 255
    }
  }
  return out
}

function greyTexture(values: Float32Array, w: number, h: number): THREE.Texture {
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, values[i] * 255)) | 0
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return dataTexture(data, w, h)
}

/* --------------------------------- plaster -------------------------------- */

export type SurfaceMaps = { bumpMap: THREE.Texture; roughnessMap: THREE.Texture; normalMap?: THREE.Texture }

/** Painted plaster: fine mottled bump and a matching roughness variation. One tile = 1 m. */
export function plasterMaps(detail: 'best' | 'fast'): SurfaceMaps {
  return memo(`plaster-${detail}`, () => {
    const size = detail === 'best' ? 256 : 128
    const n = fbm(size, 8, detail === 'best' ? 4 : 3, 11)
    const bump = new Float32Array(size * size), rough = new Float32Array(size * size)
    for (let i = 0; i < n.length; i++) {
      bump[i] = 0.5 + (n[i] - 0.5) * 0.9
      rough[i] = 0.82 + (n[i] - 0.5) * 0.25
    }
    return { bumpMap: greyTexture(bump, size, size), roughnessMap: greyTexture(rough, size, size) }
  })
}

/** Ceiling: a finer stipple. One tile = 1 m. */
export function ceilingMaps(): SurfaceMaps {
  return memo('ceiling', () => {
    const size = 128
    const n = fbm(size, 16, 3, 23)
    const bump = new Float32Array(size * size), rough = new Float32Array(size * size)
    for (let i = 0; i < n.length; i++) {
      bump[i] = 0.5 + (n[i] - 0.5) * 0.6
      rough[i] = 0.9 + (n[i] - 0.5) * 0.15
    }
    return { bumpMap: greyTexture(bump, size, size), roughnessMap: greyTexture(rough, size, size) }
  })
}

/** Woven fabric for blinds and curtains: a tight weave bump. One tile = 10 cm. */
export function fabricMaps(): SurfaceMaps {
  return memo('fabric', () => {
    const size = 64
    const bump = new Float32Array(size * size), rough = new Float32Array(size * size)
    const n = valueNoise(size, 8, 5)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const weave = (Math.sin((x / size) * Math.PI * 16) * Math.sin((y / size) * Math.PI * 16)) * 0.5 + 0.5
        const i = y * size + x
        bump[i] = 0.35 + weave * 0.3 + (n[i] - 0.5) * 0.2
        rough[i] = 0.95
      }
    }
    return { bumpMap: greyTexture(bump, size, size), roughnessMap: greyTexture(rough, size, size) }
  })
}

/* ------------------------------- oak planks ------------------------------- */

export type PlankMaps = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; tile: [number, number] }

const PLANK_W = 0.12, PLANK_L = 1.2
const PLANKS_ACROSS = 8, PLANKS_ALONG = 2
/** The neutral plank map is scaled down by this so per-plank highlights survive the clamp to 255. */
export const PLANK_GAIN = 1.2

/**
 * Oak floorboards as ONE neutral (greyscale, slightly hue-varied) set per quality level:
 * per-plank shade and grain, bevelled edges in the normal map, and a roughness map that
 * follows the grain. The room's floor colour is applied through the material colour, which
 * multiplies the map, so a colour-picker drag never generates new textures. The tile covers
 * 8 planks across (0.96 m) by two plank lengths (2.4 m); columns are staggered so the end
 * joints don't line up.
 */
export function plankMaps(detail: 'best' | 'fast'): PlankMaps {
  return memo(`planks-${detail}`, () => {
    const W = detail === 'best' ? 512 : 192
    const H = W * 2
    const rnd = seeded(97)
    const grain = fbm(W, 4, 4, 41) // will be sampled with x stretched to give long streaks
    const fine = valueNoise(W, 64, 43)
    const colorData = new Uint8Array(W * H * 4)
    const height = new Float32Array(W * H)
    const rough = new Float32Array(W * H)
    const colW = W / PLANKS_ACROSS
    const plankPx = H / PLANKS_ALONG
    const bevel = Math.max(2, Math.round(W / 170))
    // per-column stagger and per-plank shade
    const stagger = Array.from({ length: PLANKS_ACROSS }, (_, i) => ((i * 0.37 + rnd() * 0.1) % 1) * plankPx)
    const shadeOf = new Map<string, { s: number; hue: number; r: number }>()
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const col = Math.floor(x / colW)
        const localX = x - col * colW
        const yy = (y + stagger[col]) % H
        const seg = Math.floor(yy / plankPx)
        const localY = yy - seg * plankPx
        const key = `${col}-${seg}`
        let sh = shadeOf.get(key)
        if (!sh) {
          sh = { s: 0.84 + rnd() * 0.3, hue: (rnd() - 0.5) * 0.12, r: 0.5 + rnd() * 0.18 }
          shadeOf.set(key, sh)
        }
        // long grain streaks: stretch noise along the plank
        const gx = (x * 6) % W, gy = Math.floor((yy / H) * W) % W
        const g = grain[gy * W + gx]
        const f = fine[(y % W) * W + x]
        const streak = 0.9 + (g - 0.5) * 0.35 + (f - 0.5) * 0.08
        const edgeX = Math.min(localX, colW - 1 - localX), edgeY = Math.min(localY, plankPx - 1 - localY)
        const edge = Math.min(edgeX, edgeY)
        const bevelT = Math.min(1, edge / bevel) // 0 at the joint, 1 inside
        const joint = edge < 0.6 ? 0.55 : 1 // dark gap line between boards
        const lum = (sh.s * streak * joint * (0.92 + bevelT * 0.08)) / PLANK_GAIN
        const i = (y * W + x) * 4
        colorData[i] = Math.min(255, 255 * lum * (1 + sh.hue))
        colorData[i + 1] = Math.min(255, 255 * lum)
        colorData[i + 2] = Math.min(255, 255 * lum * (1 - sh.hue))
        colorData[i + 3] = 255
        height[y * W + x] = bevelT * 0.9 + (g - 0.5) * 0.12 + (f - 0.5) * 0.05
        rough[y * W + x] = sh.r + (g - 0.5) * 0.2 + (1 - bevelT) * 0.15
      }
    }
    const map = dataTexture(colorData, W, H, true)
    const normalMap = dataTexture(normalFromHeight(height, W, H, detail === 'best' ? 2.2 : 1.4), W, H)
    const roughnessMap = greyTexture(rough, W, H)
    return { map, normalMap, roughnessMap, tile: [PLANK_W * PLANKS_ACROSS, PLANK_L * PLANKS_ALONG] }
  })
}

/* ----------------------------------- sky ---------------------------------- */

/** Vertical sky gradient for the world outside the windows (day or night). */
export function skyTexture(daytime: boolean): THREE.Texture {
  return memo(`sky-${daytime}`, () => {
    const { c, g } = canvas(16, 256)
    const grad = g.createLinearGradient(0, 256, 0, 0)
    // the sky is a full sphere: v = 0.5 is the horizon, 1 the zenith
    if (daytime) {
      // pale warm haze at the horizon deepening to a clear blue overhead
      grad.addColorStop(0, '#e6eef6')
      grad.addColorStop(0.5, '#e9eff5')
      grad.addColorStop(0.53, '#c4dbf2')
      grad.addColorStop(0.6, '#8fbcec')
      grad.addColorStop(0.72, '#5f9be0')
      grad.addColorStop(1, '#3a78cc')
    } else {
      grad.addColorStop(0, '#343d66')
      grad.addColorStop(0.5, '#343d66')
      grad.addColorStop(0.62, '#1a2244')
      grad.addColorStop(0.82, '#0a0f26')
      grad.addColorStop(1, '#05081a')
    }
    g.fillStyle = grad
    g.fillRect(0, 0, 16, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = THREE.RepeatWrapping
    return t
  })
}

/** Radial alpha fade (opaque centre → transparent rim) for the ground disc under the room. */
export function groundFadeTexture(): THREE.Texture {
  return memo('ground-fade', () => {
    const { c, g } = canvas(256, 256)
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.45, 'rgba(255,255,255,0.95)')
    grad.addColorStop(0.8, 'rgba(255,255,255,0.35)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(c)
  })
}

/** A soft cloud: a few overlapping radial blobs with a feathered edge (alpha in the image). */
export function cloudTexture(): THREE.Texture {
  return memo('cloud', () => {
    const { c, g } = canvas(256, 128)
    const rnd = seeded(5)
    for (let i = 0; i < 9; i++) {
      const x = 40 + rnd() * 176, y = 50 + rnd() * 40, r = 28 + rnd() * 30
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, 'rgba(255,255,255,0.9)')
      grad.addColorStop(0.55, 'rgba(255,255,255,0.45)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, 256, 128)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })
}

/** Soft radial glow sprite (used for the moon halo). */
export function glowTexture(): THREE.Texture {
  return memo('glow', () => {
    const { c, g } = canvas(64, 64)
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.3, 'rgba(255,255,255,0.35)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })
}
