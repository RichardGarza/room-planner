import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { wallLength } from '../geometry'
import { useStore } from '../store'
import type { Door, Opening, Radiator as RadiatorSpec, Room, Wall } from '../types'
import { Outside } from './Outside'
import { ceilingMaps, fabricMaps, plasterMaps } from './textures'
import { cm, mergedBoxes, profileAlongX, seeded, starShape, WALL_T, worldUvBox, type BoxSpec } from './util'

/* ---------------------------------- shell --------------------------------- */

/**
 * Each wall gets a group whose local x runs along the wall (increasing offset),
 * local y is up and local +z points into the room. Everything on the wall is built
 * in those local coordinates, so a window or door can sit on any wall.
 */
export function wallTransform(room: Room, wall: Wall): { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] } {
  const W = cm(room.w), D = cm(room.d)
  switch (wall) {
    case 'top': return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    case 'bottom': return { position: [0, 0, D], rotation: [0, Math.PI, 0], scale: [-1, 1, 1] }
    case 'left': return { position: [0, 0, 0], rotation: [0, -Math.PI / 2, 0], scale: [1, 1, -1] }
    case 'right': return { position: [W, 0, 0], rotation: [0, -Math.PI / 2, 0], scale: [1, 1, 1] }
  }
}

type Detail = 'best' | 'fast'

/* Shared materials: one instance per look, reused by every mesh that needs it. */
const matCache = new Map<string, THREE.Material>()
function sharedMat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined
  if (!m) { m = make(); matCache.set(key, m) }
  return m
}
const paint = (color: string, roughness = 0.55) => sharedMat(`paint-${color}-${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }))
const chrome = () => sharedMat('chrome', () => new THREE.MeshStandardMaterial({ color: '#b9bcc2', metalness: 0.9, roughness: 0.28 }))
const brushed = () => sharedMat('brushed', () => new THREE.MeshStandardMaterial({ color: '#8f9094', metalness: 0.85, roughness: 0.42 }))
function clothMat(color: string, detail: Detail) {
  return sharedMat(`cloth-${color}-${detail}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })
    if (detail === 'best') {
      const f = fabricMaps()
      f.bumpMap.repeat.set(10, 10)
      m.bumpMap = f.bumpMap
      m.bumpScale = 0.0025
    }
    return m
  })
}
function wallMat(color: string, detail: Detail) {
  return sharedMat(`wall-${color}-${detail}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 })
    if (detail === 'best') {
      const p = plasterMaps(detail)
      p.bumpMap.repeat.set(1.7, 1.7)
      p.roughnessMap.repeat.set(1.7, 1.7)
      m.bumpMap = p.bumpMap
      m.bumpScale = 0.0035
      m.roughnessMap = p.roughnessMap
      m.roughness = 1
    }
    return m
  })
}

const SKIRT_H = 0.12
const skirtProfile: [number, number][] = [[0, 0], [0.018, 0], [0.018, 0.092], [0.015, 0.1], [0.011, 0.104], [0.011, 0.111], [0.005, 0.118], [0, SKIRT_H]]
function corniceProfile(H: number): [number, number][] {
  const r = 0.075
  const pts: [number, number][] = [[0, H - r], [0, H], [r, H]]
  for (let i = 1; i <= 6; i++) {
    const a = Math.PI / 2 + (i / 6) * (Math.PI / 2)
    pts.push([r + r * Math.cos(a), H - r + r * Math.sin(a)])
  }
  return pts
}

export function Shell({ room }: { room: Room }) {
  const view = useStore((s) => s.view)
  const daytime = useStore((s) => s.daytime)
  const quality = useStore((s) => s.quality)
  const W = cm(room.w), D = cm(room.d), H = cm(room.h)
  const walls = useRef<Record<Wall, THREE.Group | null>>({ top: null, bottom: null, left: null, right: null })
  const ceiling = useRef<THREE.Group>(null)

  useFrame(({ camera }) => {
    const c = camera.position
    const outside = view === 'outside'
    const w = walls.current
    if (w.top) w.top.visible = !(outside && c.z < 0.2)
    if (w.bottom) w.bottom.visible = !(outside && c.z > D - 0.2)
    if (w.left) w.left.visible = !(outside && c.x < 0.2)
    if (w.right) w.right.visible = !(outside && c.x > W - 0.2)
    if (ceiling.current) ceiling.current.visible = !outside
  })

  const ceilMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#f7f4ef', roughness: 1 })
    if (quality === 'best') {
      const c = ceilingMaps()
      m.bumpMap = c.bumpMap
      m.bumpScale = 0.003
      m.roughnessMap = c.roughnessMap
    }
    return m
  }, [quality])
  useLayoutEffect(() => {
    if (ceilMat.bumpMap) ceilMat.bumpMap.repeat.set(W, D)
    if (ceilMat.roughnessMap) ceilMat.roughnessMap.repeat.set(W, D)
  }, [ceilMat, W, D])

  return (
    <group>
      {/* ceiling (walk mode only) */}
      <group ref={ceiling}>
        <mesh position={[W / 2, H, D / 2]} rotation={[Math.PI / 2, 0, 0]} material={ceilMat} receiveShadow>
          <planeGeometry args={[W, D]} />
        </mesh>
      </group>
      <Pendant position={[W / 2, H, D / 2]} daytime={daytime} />

      {(['top', 'bottom', 'left', 'right'] as Wall[]).map((wall) => {
        const t = wallTransform(room, wall)
        return (
          <group key={wall} ref={(g) => { walls.current[wall] = g }} position={t.position} rotation={t.rotation} scale={t.scale}>
            <WallFace room={room} wall={wall} daytime={daytime} detail={quality} />
          </group>
        )
      })}
    </group>
  )
}

/** Pendant lamp: ceiling rose, flex, a fabric drum shade and the bulb inside it. */
function Pendant({ position, daytime }: { position: [number, number, number]; daytime: boolean }) {
  // by day a fabric shade; at night the lit shade is an even warm glow (unlit material), the bulb blooms
  const shadeDay = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f6efe6', roughness: 1, side: THREE.DoubleSide }), [])
  const shadeNight = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f3c48f', side: THREE.DoubleSide }), [])
  const bulb = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff9ee', roughness: 0.4, emissive: '#ffd9a6', emissiveIntensity: 0 }), [])
  useLayoutEffect(() => {
    bulb.emissiveIntensity = daytime ? 0 : 2.4
  }, [daytime, bulb])
  const shade = daytime ? shadeDay : shadeNight
  return (
    <group position={position}>
      <mesh position={[0, -0.012, 0]} material={paint('#f1ece5', 0.7)}><cylinderGeometry args={[0.06, 0.07, 0.024, 20]} /></mesh>
      <mesh position={[0, -0.18, 0]} material={paint('#6a6560', 0.8)}><cylinderGeometry args={[0.004, 0.004, 0.34, 8]} /></mesh>
      <mesh position={[0, -0.44, 0]} material={shade}>
        <cylinderGeometry args={[0.16, 0.19, 0.2, 28, 1, true]} />
      </mesh>
      <mesh position={[0, -0.34, 0]} material={paint('#f1ece5', 0.7)}><cylinderGeometry args={[0.16, 0.16, 0.006, 28]} /></mesh>
      <mesh position={[0, -0.41, 0]} material={bulb}><sphereGeometry args={[0.035, 16, 12]} /></mesh>
    </group>
  )
}

/** One wall in its local frame: solid plaster pieces around any openings, plus what hangs on it. */
export function WallFace({ room, wall, daytime, detail }: { room: Room; wall: Wall; daytime: boolean; detail: Detail }) {
  const L = cm(wallLength(room, wall)), H = cm(room.h)
  const color = room.wallColors[wall]
  const windows = room.windows.filter((o) => o.wall === wall)
  const doors = room.doors.filter((o) => o.wall === wall)
  const radiators = room.radiators.filter((o) => o.wall === wall)
  const openings = [...windows, ...doors].sort((a, b) => a.offset - b.offset)
  const mat = wallMat(color, detail)
  const trim = paint('#f8f6f2', 0.5)

  // Solid pieces: split the wall at each opening's edges (overlapping openings just merge).
  const pieces = useMemo(() => {
    const out: { x: number; y: number; w: number; h: number }[] = []
    let cursor = 0
    for (const o of openings) {
      const o0 = Math.max(cursor, cm(o.offset)), o1 = Math.min(L, cm(o.offset + o.width))
      if (o1 <= o0) continue
      const s = cm(o.sill), t = cm(o.sill + o.height)
      if (o0 > cursor) out.push({ x: (cursor + o0) / 2, y: H / 2, w: o0 - cursor, h: H })
      if (s > 0) out.push({ x: (o0 + o1) / 2, y: s / 2, w: o1 - o0, h: s })
      if (t < H) out.push({ x: (o0 + o1) / 2, y: (t + H) / 2, w: o1 - o0, h: H - t })
      cursor = o1
    }
    if (cursor < L) out.push({ x: (cursor + L) / 2, y: H / 2, w: L - cursor, h: H })
    // the end pieces extend by the wall thickness so the corners close up
    return out.map((p, i) => {
      const ext = (i === 0 ? WALL_T : 0) + (i === out.length - 1 ? WALL_T : 0)
      const shift = (i === out.length - 1 ? WALL_T / 2 : 0) - (i === 0 ? WALL_T / 2 : 0)
      return { ...p, x: p.x + shift, w: p.w + ext, geo: worldUvBox(p.w + ext, p.h, WALL_T) }
    })
  }, [L, H, JSON.stringify(openings)])

  // Skirting and cornice run along the wall; the skirting stops at each door.
  const skirting = useMemo(() => {
    const runs: [number, number][] = []
    let sc = 0
    for (const d of [...doors].sort((a, b) => a.offset - b.offset)) {
      const d0 = cm(d.offset) - 0.05, d1 = cm(d.offset + d.width) + 0.05
      if (d0 > sc) runs.push([sc, d0])
      sc = Math.max(sc, d1)
    }
    if (sc < L) runs.push([sc, L])
    return runs.map(([a, b]) => profileAlongX(skirtProfile, a, b))
  }, [L, JSON.stringify(doors)])
  const cornice = useMemo(() => profileAlongX(corniceProfile(H), 0, L), [H, L])

  return (
    <group>
      {pieces.map((p, i) => (
        <mesh key={i} geometry={p.geo} material={mat} position={[p.x, p.y, -WALL_T / 2]} receiveShadow castShadow />
      ))}
      {skirting.map((g, i) => <mesh key={i} geometry={g} material={trim} castShadow receiveShadow />)}
      <mesh geometry={cornice} material={paint('#f9f7f3', 0.8)} />
      {windows.length > 0 && <Outside windows={windows} wallLength={L} daytime={daytime} detail={detail} />}
      {windows.map((w) => <Window key={w.id} win={w} daytime={daytime} detail={detail} />)}
      {radiators.map((r) => <Radiator key={r.id} radiator={r} />)}
      {doors.map((d) => <Doorway key={d.id} room={room} door={d} daytime={daytime} />)}
      {(wall === 'left' || wall === 'right') && <Stars room={room} side={wall} />}
    </group>
  )
}

/** A pleated curtain: a plane whose depth follows a sine wave across its width. */
function useCurtainGeometry(width: number, height: number, detail: Detail) {
  return useMemo(() => {
    const seg = detail === 'best' ? 40 : 16
    const g = new THREE.PlaneGeometry(width, height, seg, 2)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const folds = Math.max(2, Math.round(width / 0.09))
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i)
      const u = (x / width + 0.5) * Math.PI * 2 * folds
      const taper = 0.75 + 0.25 * ((y / height) + 0.5) // pleats get slightly flatter toward the hem
      pos.setZ(i, Math.sin(u) * 0.022 * taper)
    }
    pos.needsUpdate = true
    g.computeVertexNormals()
    return g
  }, [width, height, detail])
}

export function Window({ win, daytime, detail }: { win: Opening; daytime: boolean; detail: Detail }) {
  const blinds = useStore((s) => s.blinds)
  const x0 = cm(win.offset), ww = cm(win.width), s = cm(win.sill), hh = cm(win.height)
  const cx = x0 + ww / 2, cy = s + hh / 2
  const blindH = (hh * blinds) / 100
  const panes = Math.max(1, Math.round(win.width / 55))
  const transom = s + hh * 0.66
  const zMid = -WALL_T / 2
  const frame = paint('#fbfbfa', 0.45)
  const lining = paint('#f5f3ef', 0.7)
  const metal = chrome()
  const rodMetal = brushed()
  const cloth = clothMat('#e4dcd3', detail)
  const blindCloth = clothMat('#f1ece4', detail)
  const curtainTop = s + hh + 0.22
  const curtainBottom = Math.max(0.04, s - 0.28)
  const curtainH = curtainTop - curtainBottom
  const curtainW = 0.42
  const curtain = useCurtainGeometry(curtainW, curtainH, detail)

  // Frame + transom + mullions as one geometry; the outer frame sits deep in the reveal.
  const sash = useMemo(() => {
    const boxes: BoxSpec[] = [
      [cx, s + 0.035, zMid + 0.01, ww, 0.07, 0.08],
      [cx, s + hh - 0.035, zMid + 0.01, ww, 0.07, 0.08],
      [x0 + 0.035, cy, zMid + 0.01, 0.07, hh, 0.08],
      [x0 + ww - 0.035, cy, zMid + 0.01, 0.07, hh, 0.08],
      [cx, transom, zMid + 0.01, ww, 0.04, 0.07],
    ]
    for (let i = 1; i < panes; i++) boxes.push([x0 + (i * ww) / panes, cy, zMid + 0.01, 0.04, hh, 0.07])
    // thin glazing beads around every pane
    for (let i = 0; i < panes; i++) {
      const px0 = x0 + (i * ww) / panes + 0.035, px1 = x0 + ((i + 1) * ww) / panes - 0.035
      boxes.push([(px0 + px1) / 2, s + 0.075, zMid + 0.035, px1 - px0, 0.012, 0.02])
      boxes.push([(px0 + px1) / 2, s + hh - 0.075, zMid + 0.035, px1 - px0, 0.012, 0.02])
    }
    return mergedBoxes(boxes)
  }, [cx, cy, s, hh, ww, x0, transom, panes, zMid])

  const reveal = useMemo(() => mergedBoxes([
    [cx, s + 0.012, zMid, ww + 0.05, 0.024, WALL_T + 0.01],
    [cx, s + hh - 0.012, zMid, ww + 0.05, 0.024, WALL_T + 0.01],
    [x0 + 0.012, cy, zMid, 0.024, hh, WALL_T + 0.01],
    [x0 + ww - 0.012, cy, zMid, 0.024, hh, WALL_T + 0.01],
  ]), [cx, cy, s, hh, ww, x0, zMid])

  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: daytime ? '#dbeeff' : '#7e93bd',
    transparent: true,
    opacity: daytime ? 0.16 : 0.3,
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [daytime])

  return (
    <group>
      {/* reveal: the wall thickness lining the opening */}
      <mesh geometry={reveal} material={lining} receiveShadow />
      {/* glazing */}
      <mesh position={[cx, cy, zMid + 0.01]} material={glass} renderOrder={2}>
        <planeGeometry args={[ww, hh]} />
      </mesh>
      {/* frame, transom, mullions and beads */}
      <mesh geometry={sash} material={frame} castShadow receiveShadow />
      {/* window handle on the first pane */}
      <group position={[x0 + ww / panes - 0.08, transom - 0.13, zMid + 0.06]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={metal}><cylinderGeometry args={[0.022, 0.022, 0.014, 14]} /></mesh>
        <mesh position={[0, -0.06, 0.014]} material={metal}><boxGeometry args={[0.014, 0.13, 0.014]} /></mesh>
      </group>
      {/* inner sill with a nosing and a small apron beneath */}
      <mesh position={[cx, s - 0.012, 0.075]} material={frame} castShadow receiveShadow><boxGeometry args={[ww + 0.2, 0.024, 0.27]} /></mesh>
      <mesh position={[cx, s - 0.034, 0.2]} material={frame}><boxGeometry args={[ww + 0.2, 0.02, 0.02]} /></mesh>
      <mesh position={[cx, s - 0.06, 0.008]} material={frame}><boxGeometry args={[ww + 0.14, 0.05, 0.016]} /></mesh>
      {/* roller blind: housing, end caps, cloth, bottom bar and pull cord */}
      <mesh position={[cx, s + hh + 0.06, 0.05]} material={paint('#ecebe7', 0.7)} castShadow><boxGeometry args={[ww + 0.12, 0.09, 0.09]} /></mesh>
      {blindH > 0.01 && (
        <>
          <mesh position={[cx, s + hh + 0.02 - blindH / 2, 0.048]} material={blindCloth} castShadow>
            <planeGeometry args={[ww + 0.08, blindH + 0.04]} />
          </mesh>
          <mesh position={[cx, s + hh - blindH, 0.048]} material={paint('#dcd7cd', 0.8)}><boxGeometry args={[ww + 0.08, 0.02, 0.022]} /></mesh>
        </>
      )}
      <mesh position={[x0 + ww + 0.045, s + hh / 2 + 0.02, 0.09]} material={paint('#cfcac2', 0.9)}><cylinderGeometry args={[0.003, 0.003, hh, 6]} /></mesh>
      {/* curtain rod with finials and brackets, and a pleated curtain each side */}
      <mesh position={[cx, curtainTop + 0.02, 0.14]} rotation={[0, 0, Math.PI / 2]} material={rodMetal}><cylinderGeometry args={[0.013, 0.013, ww + 1.1, 12]} /></mesh>
      {[cx - ww / 2 - 0.55, cx + ww / 2 + 0.55].map((x, i) => (
        <mesh key={i} position={[x, curtainTop + 0.02, 0.14]} material={rodMetal}><sphereGeometry args={[0.03, 14, 10]} /></mesh>
      ))}
      {[cx - ww / 2 - 0.35, cx + ww / 2 + 0.35].map((x, i) => (
        <mesh key={i} position={[x, curtainTop + 0.02, 0.07]} rotation={[Math.PI / 2, 0, 0]} material={rodMetal}><cylinderGeometry args={[0.008, 0.008, 0.14, 8]} /></mesh>
      ))}
      {[x0 - 0.2, x0 + ww + 0.2].map((x, i) => (
        <mesh key={i} geometry={curtain} material={cloth} position={[x, (curtainTop + curtainBottom) / 2, 0.12]} castShadow receiveShadow />
      ))}
    </group>
  )
}

export function Radiator({ radiator: r }: { radiator: RadiatorSpec }) {
  const x0 = cm(r.offset), w = cm(r.width), h = cm(r.height), d = cm(r.depth)
  const finCount = Math.max(4, Math.floor(r.width / 8))
  const y0 = 0.14 // bottom edge above the floor
  const white = paint('#f7f7f5', 0.45)
  const metal = chrome()
  const pipeLen = y0 + 0.08
  const fins = useMemo(() => mergedBoxes(Array.from({ length: finCount }, (_, i): BoxSpec => [-w / 2 + (i + 0.5) * (w / finCount), 0, 0, w / finCount - 0.012, h * 0.92, d])), [finCount, w, h, d])
  return (
    <group position={[x0 + w / 2, y0 + h / 2, d / 2 + 0.02]}>
      {/* back panel and front convector fins */}
      <mesh material={white} castShadow><boxGeometry args={[w, h, d * 0.5]} /></mesh>
      <mesh geometry={fins} material={paint('#ffffff', 0.4)} castShadow receiveShadow />
      {/* top grille */}
      <mesh position={[0, h / 2 + 0.006, 0]} material={white}><boxGeometry args={[w, 0.012, d]} /></mesh>
      <mesh position={[0, h / 2 + 0.013, 0]} material={paint('#cfcfcc', 0.6)}><boxGeometry args={[w - 0.04, 0.004, d * 0.55]} /></mesh>
      {/* wall brackets */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (w / 2 - 0.12), -h * 0.2, -d / 2 - 0.012]} material={metal}><boxGeometry args={[0.03, h * 0.5, 0.024]} /></mesh>
      ))}
      {/* thermostat valve on the right, lockshield on the left, pipes down to the floor */}
      <group position={[w / 2 + 0.05, -h / 2 + 0.08, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={white}><cylinderGeometry args={[0.024, 0.024, 0.07, 16]} /></mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.02, 0, 0]} material={paint('#d33b3b', 0.5)}><cylinderGeometry args={[0.026, 0.026, 0.008, 16]} /></mesh>
      </group>
      <mesh position={[-w / 2 - 0.05, -h / 2 + 0.08, 0]} rotation={[0, 0, Math.PI / 2]} material={metal}><cylinderGeometry args={[0.016, 0.016, 0.05, 12]} /></mesh>
      {[w / 2 + 0.08, -w / 2 - 0.07].map((x, i) => (
        <mesh key={i} position={[x, -h / 2 + 0.08 - pipeLen / 2, 0]} material={metal}><cylinderGeometry args={[0.009, 0.009, pipeLen, 10]} /></mesh>
      ))}
    </group>
  )
}

export function Doorway({ room, door: d, daytime }: { room: Room; door: Door; daytime: boolean }) {
  const doorAngle = useStore((s) => s.doorAngle)
  const view = useStore((s) => s.view)
  const x0 = cm(d.offset), ww = cm(d.width), hh = cm(d.height), H = cm(room.h)
  const cx = x0 + ww / 2
  // hinge 'left' = smaller offset. The leaf is built along local +x from the hinge and turns about y:
  // a negative turn takes +x toward local +z (into the room), a positive one toward -z (out of the room).
  // That matches doorSwing(), which mirrors the wall normal for swing "out".
  const hingeX = d.hinge === 'left' ? x0 : x0 + ww
  const phi = (doorAngle * Math.PI) / 180
  const into = d.swing === 'out' ? -1 : 1
  const leafRot = d.hinge === 'left' ? -phi * into : Math.PI + phi * into
  const trim = paint('#fbfaf7', 0.5)
  const leafPaint = paint('#f9f7f3', 0.5)
  const panelPaint = paint('#f2efe9', 0.6)
  const metal = chrome()
  const hall = paint('#ddd6cc', 0.95)
  const LEAF_T = 0.045

  const jamb = useMemo(() => mergedBoxes([
    [x0 + 0.02, hh / 2, -WALL_T / 2, 0.04, hh, WALL_T],
    [x0 + ww - 0.02, hh / 2, -WALL_T / 2, 0.04, hh, WALL_T],
    [cx, hh + 0.02, -WALL_T / 2, ww + 0.08, 0.04, WALL_T],
  ]), [x0, ww, hh, cx])
  // architrave on both faces of the wall, with a slightly heavier head piece
  const architrave = useMemo(() => {
    const boxes: BoxSpec[] = []
    for (const z of [0.012, -WALL_T - 0.012]) {
      boxes.push([x0 - 0.045, hh / 2 + 0.02, z, 0.085, hh + 0.04, 0.024])
      boxes.push([x0 + ww + 0.045, hh / 2 + 0.02, z, 0.085, hh + 0.04, 0.024])
      boxes.push([cx, hh + 0.085, z, ww + 0.2, 0.09, 0.024])
      boxes.push([cx, hh + 0.135, z * 1.15, ww + 0.22, 0.012, 0.03])
    }
    return mergedBoxes(boxes)
  }, [x0, ww, hh, cx])
  // four raised panels on each face of the leaf
  const panels = useMemo(() => {
    const frames: BoxSpec[] = [], raised: BoxSpec[] = []
    const cols = [ww * 0.29, ww * 0.71], colW = ww * 0.31
    const rows: [number, number][] = [[hh * 0.72, hh * 0.36], [hh * 0.27, hh * 0.3]]
    for (const [z, dir] of [[LEAF_T + 0.002, 1], [-0.002, -1]] as [number, number][]) {
      for (const cxp of cols) for (const [y, ph] of rows) {
        frames.push([cxp, y, z, colW, ph, 0.006])
        raised.push([cxp, y, z + dir * 0.006, colW - 0.07, ph - 0.07, 0.008])
      }
    }
    return { frames: mergedBoxes(frames), raised: mergedBoxes(raised) }
  }, [ww, hh])
  const hinges = useMemo(() => mergedBoxes([0.25, hh / 2, hh - 0.25].map((y): BoxSpec => [0.004, y, LEAF_T / 2, 0.012, 0.1, 0.012])), [hh])

  return (
    <group>
      <mesh geometry={jamb} material={trim} receiveShadow />
      <mesh geometry={architrave} material={trim} castShadow receiveShadow />
      {/* threshold strip */}
      <mesh position={[cx, 0.006, -WALL_T / 2]} material={paint('#c9b79c', 0.6)}><boxGeometry args={[ww, 0.012, WALL_T + 0.02]} /></mesh>
      {/* leaf: panelled, with lever handles on both faces and three hinges */}
      <group position={[hingeX, 0, 0]} rotation={[0, leafRot, 0]}>
        <mesh position={[ww / 2, hh / 2 + 0.005, LEAF_T / 2]} material={leafPaint} castShadow receiveShadow>
          <boxGeometry args={[ww - 0.02, hh - 0.01, LEAF_T]} />
        </mesh>
        <mesh geometry={panels.frames} material={panelPaint} position={[0, 0, 0]} />
        <mesh geometry={panels.raised} material={leafPaint} castShadow receiveShadow />
        {[
          [LEAF_T + 0.008, LEAF_T + 0.026],
          [-0.008, -0.026],
        ].map(([zr, zl], i) => (
          <group key={i} position={[ww - 0.09, 1.02, 0]}>
            <mesh position={[0, 0, zr]} rotation={[Math.PI / 2, 0, 0]} material={metal}><cylinderGeometry args={[0.026, 0.026, 0.012, 18]} /></mesh>
            <mesh position={[0, 0, zl]} rotation={[Math.PI / 2, 0, 0]} material={metal}><cylinderGeometry args={[0.008, 0.008, 0.03, 10]} /></mesh>
            <mesh position={[-0.055, 0, zl]} material={metal}><boxGeometry args={[0.12, 0.016, 0.016]} /></mesh>
          </group>
        ))}
        <mesh geometry={hinges} material={metal} />
      </group>
      {/* hallway beyond the door: floor, walls, skirting, a soft light and (when walking) a ceiling */}
      <group position={[cx, 0, 0]}>
        <mesh position={[0, 0, -1.2]} rotation={[-Math.PI / 2, 0, 0]} material={paint('#7a5443', 0.85)} receiveShadow>
          <planeGeometry args={[3, 2.4]} />
        </mesh>
        <mesh position={[0, H / 2, -2.4]} material={hall} receiveShadow>
          <planeGeometry args={[3, H]} />
        </mesh>
        {[-1.5, 1.5].map((x) => (
          <mesh key={x} position={[x, H / 2, -1.2]} rotation={[0, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0]} material={hall} receiveShadow>
            <planeGeometry args={[2.4, H]} />
          </mesh>
        ))}
        <mesh position={[0, 0.05, -2.385]} material={trim}><boxGeometry args={[3, 0.1, 0.03]} /></mesh>
        {/* a small picture on the hall wall */}
        <mesh position={[0.55, 1.5, -2.38]} material={paint('#3b3733', 0.6)}><boxGeometry args={[0.42, 0.34, 0.02]} /></mesh>
        <mesh position={[0.55, 1.5, -2.368]} material={paint('#a9c1c8', 0.9)}><planeGeometry args={[0.36, 0.28]} /></mesh>
        <pointLight position={[0, H - 0.4, -1.2]} intensity={daytime ? 0 : 2.2} color="#ffd9a8" distance={4.5} decay={2} />
        {view === 'walk' && (
          <mesh position={[0, H, -1.2]} rotation={[Math.PI / 2, 0, 0]} material={paint('#f3efe9', 1)}>
            <planeGeometry args={[3, 2.4]} />
          </mesh>
        )}
      </group>
    </group>
  )
}

/** Little wall stars like the ones in the photo: subtle painted decals on the side walls. */
export function Stars({ room, side }: { room: Room; side: 'left' | 'right' }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = 26
  const geo = useMemo(() => new THREE.ShapeGeometry(starShape(1), 2), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), [])
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const rnd = seeded(side === 'left' ? 7 : 13)
    const o = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const r = 0.03 + rnd() * 0.05
      o.position.set(0.3 + rnd() * (cm(room.d) - 0.6), 0.9 + rnd() * 1.4, 0.003)
      o.rotation.set(0, 0, rnd() * Math.PI)
      o.scale.set(r, r, 1)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }, [room.d, side])
  return <instancedMesh ref={ref} args={[geo, mat, count]} />
}
