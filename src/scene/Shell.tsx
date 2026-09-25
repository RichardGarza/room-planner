import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { wallLength } from '../geometry'
import { useStore } from '../store'
import type { Door, Opening, Radiator as RadiatorSpec, Room, Wall } from '../types'
import { cm, WALL_T } from './util'

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

export function Shell({ room }: { room: Room }) {
  const view = useStore((s) => s.view)
  const daytime = useStore((s) => s.daytime)
  const W = cm(room.w), D = cm(room.d), H = cm(room.h)
  const walls = useRef<Record<Wall, THREE.Group | null>>({ top: null, bottom: null, left: null, right: null })
  const ceiling = useRef<THREE.Mesh>(null)

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

  return (
    <group>
      {/* ceiling (walk mode only) */}
      <mesh ref={ceiling} position={[W / 2, H, D / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#f6f2ec" roughness={1} />
      </mesh>
      {/* pendant lamp */}
      <group position={[W / 2, H, D / 2]}>
        <mesh position={[0, -0.15, 0]}><cylinderGeometry args={[0.005, 0.005, 0.3]} /><meshStandardMaterial color="#888" /></mesh>
        <mesh position={[0, -0.36, 0]}><sphereGeometry args={[0.13, 24, 16]} /><meshStandardMaterial color="#fff5e6" emissive={daytime ? '#000' : '#ffd08a'} emissiveIntensity={1.4} /></mesh>
      </group>

      {(['top', 'bottom', 'left', 'right'] as Wall[]).map((wall) => {
        const t = wallTransform(room, wall)
        return (
          <group key={wall} ref={(g) => { walls.current[wall] = g }} position={t.position} rotation={t.rotation} scale={t.scale}>
            <WallFace room={room} wall={wall} daytime={daytime} />
          </group>
        )
      })}
    </group>
  )
}

/** One wall in its local frame: solid pieces around any openings, plus what hangs on it. */
export function WallFace({ room, wall, daytime }: { room: Room; wall: Wall; daytime: boolean }) {
  const L = cm(wallLength(room, wall)), H = cm(room.h)
  const color = room.wallColors[wall]
  const windows = room.windows.filter((o) => o.wall === wall)
  const doors = room.doors.filter((o) => o.wall === wall)
  const radiators = room.radiators.filter((o) => o.wall === wall)
  const openings = [...windows, ...doors].sort((a, b) => a.offset - b.offset)
  const mat = <meshStandardMaterial color={color} roughness={0.95} />
  const trim = <meshStandardMaterial color="#f8f6f2" roughness={0.6} />

  // Solid pieces: split the wall at each opening's edges (overlapping openings just merge).
  const pieces: [number, number, number, number][] = [] // cx, cy, w, h
  let cursor = 0
  for (const o of openings) {
    const o0 = Math.max(cursor, cm(o.offset)), o1 = Math.min(L, cm(o.offset + o.width))
    if (o1 <= o0) continue
    const s = cm(o.sill), t = cm(o.sill + o.height)
    if (o0 > cursor) pieces.push([(cursor + o0) / 2, H / 2, o0 - cursor, H])
    if (s > 0) pieces.push([(o0 + o1) / 2, s / 2, o1 - o0, s])
    if (t < H) pieces.push([(o0 + o1) / 2, (t + H) / 2, o1 - o0, H - t])
    cursor = o1
  }
  if (cursor < L) pieces.push([(cursor + L) / 2, H / 2, L - cursor, H])

  // Skirting runs along the wall but stops at each door.
  const skirting: [number, number][] = []
  let sc = 0
  for (const d of [...doors].sort((a, b) => a.offset - b.offset)) {
    const d0 = cm(d.offset), d1 = cm(d.offset + d.width)
    if (d0 > sc) skirting.push([sc, d0])
    sc = Math.max(sc, d1)
  }
  if (sc < L) skirting.push([sc, L])

  return (
    <group>
      {pieces.map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, -WALL_T / 2]} receiveShadow castShadow>
          <boxGeometry args={[w + (i === 0 || i === pieces.length - 1 ? WALL_T : 0), h, WALL_T]} />
          {mat}
        </mesh>
      ))}
      {/* skirting board with a small moulded top */}
      {skirting.map(([a, b], i) => (
        <group key={i}>
          <mesh position={[(a + b) / 2, 0.05, 0.012]} castShadow><boxGeometry args={[b - a, 0.1, 0.024]} />{trim}</mesh>
          <mesh position={[(a + b) / 2, 0.106, 0.008]}><boxGeometry args={[b - a, 0.012, 0.016]} /><meshStandardMaterial color="#efece6" roughness={0.6} /></mesh>
        </group>
      ))}
      {/* coving where the wall meets the ceiling */}
      <mesh position={[L / 2, H - 0.035, 0.02]}><boxGeometry args={[L, 0.07, 0.04]} /><meshStandardMaterial color="#f7f4ef" roughness={0.9} /></mesh>
      {windows.map((w) => <Window key={w.id} win={w} daytime={daytime} />)}
      {radiators.map((r) => <Radiator key={r.id} radiator={r} />)}
      {doors.map((d) => <Doorway key={d.id} room={room} door={d} />)}
      {(wall === 'left' || wall === 'right') && <Stars room={room} side={wall} />}
    </group>
  )
}

/** Vertical sky gradient for the view outside a window (day or night). */
export function useSkyTexture(daytime: boolean) {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 0, 256)
    if (daytime) {
      grad.addColorStop(0, '#5f97dc')
      grad.addColorStop(0.55, '#b8d6f4')
      grad.addColorStop(1, '#eef4fb')
    } else {
      grad.addColorStop(0, '#05081a')
      grad.addColorStop(0.6, '#141c3a')
      grad.addColorStop(1, '#2b3050')
    }
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [daytime])
}

export function Window({ win, daytime }: { win: Opening; daytime: boolean }) {
  const blinds = useStore((s) => s.blinds)
  const sky = useSkyTexture(daytime)
  const x0 = cm(win.offset), ww = cm(win.width), s = cm(win.sill), hh = cm(win.height)
  const cx = x0 + ww / 2, cy = s + hh / 2
  const blindH = (hh * blinds) / 100
  const panes = Math.max(1, Math.round(win.width / 55))
  const transom = s + hh * 0.66
  const zMid = -WALL_T / 2
  const frame = <meshStandardMaterial color="#fbfbfb" roughness={0.5} />
  const cloth = <meshStandardMaterial color="#dcd7d0" roughness={1} />
  const clothLight = <meshStandardMaterial color="#e6e2dc" roughness={1} />
  const metal = <meshStandardMaterial color="#9a9a98" metalness={0.8} roughness={0.35} />
  const curtainH = hh + 0.9
  const curtainY = s + hh / 2 + 0.2
  return (
    <group>
      {/* reveal: the wall thickness lining the opening */}
      {[
        [cx, s + 0.01, ww, 0.02],
        [cx, s + hh - 0.01, ww, 0.02],
        [x0 + 0.01, cy, 0.02, hh],
        [x0 + ww - 0.01, cy, 0.02, hh],
      ].map(([x, y, fw, fh], i) => (
        <mesh key={i} position={[x, y, zMid]}><boxGeometry args={[fw, fh, WALL_T]} />{frame}</mesh>
      ))}
      {/* double glazing: two panes in the middle of the wall */}
      {[zMid - 0.012, zMid + 0.012].map((z, i) => (
        <mesh key={i} position={[cx, cy, z]}>
          <planeGeometry args={[ww, hh]} />
          <meshPhysicalMaterial color={daytime ? '#d7ecfb' : '#9fb3d4'} transparent opacity={0.22} roughness={0.03} metalness={0.05} clearcoat={1} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {/* outside: lawn, hedge, a tree and the sky */}
      <mesh position={[cx, -0.02, -1.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ww + 4, 3.2]} />
        <meshStandardMaterial color={daytime ? '#7fa96b' : '#182619'} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[cx, 0.55, -2.6]}>
        <boxGeometry args={[ww + 4, 1.1, 0.5]} />
        <meshStandardMaterial color={daytime ? '#5f8f4e' : '#15211a'} roughness={1} />
      </mesh>
      <group position={[x0 + ww + 0.5, 0, -2.2]}>
        <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.06, 0.09, 1.8, 8]} /><meshStandardMaterial color="#6b4b32" roughness={1} /></mesh>
        <mesh position={[0, 2.25, 0]}><sphereGeometry args={[0.85, 14, 10]} /><meshStandardMaterial color={daytime ? '#6c9e58' : '#1a2a1c'} roughness={1} /></mesh>
        <mesh position={[0.45, 1.8, 0.2]}><sphereGeometry args={[0.55, 12, 8]} /><meshStandardMaterial color={daytime ? '#7aae62' : '#1c2e1e'} roughness={1} /></mesh>
      </group>
      <mesh position={[cx, 2.2, -3.3]}>
        <planeGeometry args={[ww + 6, 7]} />
        <meshBasicMaterial map={sky} side={THREE.DoubleSide} />
      </mesh>
      {!daytime && (
        <mesh position={[cx - ww / 3, s + hh + 0.9, -3.2]}>
          <circleGeometry args={[0.16, 24]} />
          <meshBasicMaterial color="#f3ecd2" />
        </mesh>
      )}
      {/* frame, mullions and transom */}
      {[
        [cx, s + 0.03, ww + 0.1, 0.06],
        [cx, s + hh - 0.03, ww + 0.1, 0.06],
        [x0 + 0.03, cy, 0.06, hh],
        [x0 + ww - 0.03, cy, 0.06, hh],
        [cx, transom, ww, 0.035],
        ...Array.from({ length: panes - 1 }, (_, i): number[] => [x0 + ((i + 1) * ww) / panes, cy, 0.035, hh]),
      ].map(([x, y, fw, fh], i) => (
        <mesh key={i} position={[x, y, zMid]} castShadow><boxGeometry args={[fw, fh, 0.08]} />{frame}</mesh>
      ))}
      {/* window handle on the first pane */}
      <group position={[x0 + ww / panes - 0.07, transom - 0.12, zMid + 0.05]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.022, 0.022, 0.014, 14]} />{metal}</mesh>
        <mesh position={[0, -0.06, 0.012]}><boxGeometry args={[0.016, 0.13, 0.016]} />{metal}</mesh>
      </group>
      {/* inner sill with a lip */}
      <mesh position={[cx, s - 0.015, 0.07]} castShadow receiveShadow><boxGeometry args={[ww + 0.18, 0.03, 0.26]} />{frame}</mesh>
      <mesh position={[cx, s - 0.04, 0.19]}><boxGeometry args={[ww + 0.18, 0.02, 0.02]} />{frame}</mesh>
      {/* roller blind: housing, end caps, cloth, bottom bar and pull cord */}
      <mesh position={[cx, s + hh + 0.05, 0.05]} castShadow><boxGeometry args={[ww + 0.12, 0.09, 0.09]} /><meshStandardMaterial color="#ecebe7" roughness={0.7} /></mesh>
      {[x0 - 0.07, x0 + ww + 0.07].map((x, i) => (
        <mesh key={i} position={[x, s + hh + 0.05, 0.05]}><boxGeometry args={[0.02, 0.1, 0.1]} /><meshStandardMaterial color="#d8d6d0" roughness={0.7} /></mesh>
      ))}
      {blindH > 0.01 && (
        <>
          <mesh position={[cx, s + hh - blindH / 2, 0.045]}>
            <planeGeometry args={[ww + 0.08, blindH]} />
            <meshStandardMaterial color="#f0ede6" roughness={1} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[cx, s + hh - blindH, 0.045]}><boxGeometry args={[ww + 0.08, 0.02, 0.02]} /><meshStandardMaterial color="#e2ded6" roughness={0.8} /></mesh>
        </>
      )}
      <mesh position={[x0 + ww + 0.04, s + hh / 2 + 0.02, 0.09]}><cylinderGeometry args={[0.003, 0.003, hh, 6]} /><meshStandardMaterial color="#cfcac2" /></mesh>
      {/* curtain rod with finials, and a curtain each side */}
      <mesh position={[cx, s + hh + 0.24, 0.13]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.012, 0.012, ww + 0.9, 10]} />{metal}</mesh>
      {[cx - ww / 2 - 0.45, cx + ww / 2 + 0.45].map((x, i) => (
        <mesh key={i} position={[x, s + hh + 0.24, 0.13]}><sphereGeometry args={[0.03, 12, 8]} />{metal}</mesh>
      ))}
      {[x0 - 0.2, x0 + ww + 0.2].map((x, i) => (
        <group key={i} position={[x, curtainY, 0.11]}>
          <mesh castShadow><boxGeometry args={[0.3, curtainH, 0.1]} />{cloth}</mesh>
          {[-0.1, 0, 0.1].map((dx, j) => (
            <mesh key={j} position={[dx, 0, 0.05]}><boxGeometry args={[0.05, curtainH, 0.03]} />{clothLight}</mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

export function Radiator({ radiator: r }: { radiator: RadiatorSpec }) {
  const x0 = cm(r.offset), w = cm(r.width), h = cm(r.height), d = cm(r.depth)
  const fins = Math.max(4, Math.floor(r.width / 8))
  const y0 = 0.14 // bottom edge above the floor
  const white = <meshStandardMaterial color="#f7f7f5" roughness={0.45} metalness={0.05} />
  const metal = <meshStandardMaterial color="#9a9a98" metalness={0.8} roughness={0.35} />
  const pipeLen = y0 + 0.08
  return (
    <group position={[x0 + w / 2, y0 + h / 2, d / 2 + 0.02]}>
      {/* back panel and front convector fins */}
      <mesh castShadow><boxGeometry args={[w, h, d * 0.5]} />{white}</mesh>
      {Array.from({ length: fins }, (_, i) => (
        <mesh key={i} position={[-w / 2 + (i + 0.5) * (w / fins), 0, 0]} castShadow>
          <boxGeometry args={[w / fins - 0.012, h * 0.92, d]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} metalness={0.05} />
        </mesh>
      ))}
      {/* top grille */}
      <mesh position={[0, h / 2 + 0.006, 0]}><boxGeometry args={[w, 0.012, d]} />{white}</mesh>
      <mesh position={[0, h / 2 + 0.013, 0]}><boxGeometry args={[w - 0.04, 0.004, d * 0.55]} /><meshStandardMaterial color="#cfcfcc" roughness={0.6} /></mesh>
      {/* wall brackets */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (w / 2 - 0.12), -h * 0.2, -d / 2 - 0.012]}><boxGeometry args={[0.03, h * 0.5, 0.024]} />{metal}</mesh>
      ))}
      {/* thermostat valve on the right, lockshield on the left, pipes down to the floor */}
      <group position={[w / 2 + 0.05, -h / 2 + 0.08, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.024, 0.024, 0.07, 16]} />{white}</mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.02, 0, 0]}><cylinderGeometry args={[0.026, 0.026, 0.008, 16]} /><meshStandardMaterial color="#d33b3b" roughness={0.5} /></mesh>
      </group>
      <mesh position={[-w / 2 - 0.05, -h / 2 + 0.08, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.016, 0.016, 0.05, 12]} />{metal}</mesh>
      {[w / 2 + 0.08, -w / 2 - 0.07].map((x, i) => (
        <mesh key={i} position={[x, -h / 2 + 0.08 - pipeLen / 2, 0]}><cylinderGeometry args={[0.009, 0.009, pipeLen, 10]} />{metal}</mesh>
      ))}
    </group>
  )
}

export function Doorway({ room, door: d }: { room: Room; door: Door }) {
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
  const trim = <meshStandardMaterial color="#fbfaf7" roughness={0.55} />
  const metal = <meshStandardMaterial color="#8d8d8d" metalness={0.85} roughness={0.3} />
  const hall = '#d9d3cb'
  return (
    <group>
      {/* jamb lining through the wall thickness */}
      {[
        [x0 + 0.02, hh / 2, 0.04, hh],
        [x0 + ww - 0.02, hh / 2, 0.04, hh],
        [cx, hh + 0.02, ww + 0.08, 0.04],
      ].map(([x, y, fw, fh], i) => (
        <mesh key={i} position={[x, y, -WALL_T / 2]}><boxGeometry args={[fw, fh, WALL_T]} />{trim}</mesh>
      ))}
      {/* architrave on both faces of the wall */}
      {[0.012, -WALL_T - 0.012].map((z) => (
        <group key={z}>
          {[
            [x0 - 0.05, hh / 2 + 0.02, 0.08, hh + 0.04],
            [x0 + ww + 0.05, hh / 2 + 0.02, 0.08, hh + 0.04],
            [cx, hh + 0.08, ww + 0.18, 0.08],
          ].map(([x, y, fw, fh], i) => (
            <mesh key={i} position={[x, y, z]} castShadow><boxGeometry args={[fw, fh, 0.024]} />{trim}</mesh>
          ))}
        </group>
      ))}
      {/* threshold strip */}
      <mesh position={[cx, 0.006, -WALL_T / 2]}><boxGeometry args={[ww, 0.012, WALL_T + 0.02]} /><meshStandardMaterial color="#c9b79c" roughness={0.6} /></mesh>
      {/* leaf: panelled, with lever handles on both faces and three hinges */}
      <group position={[hingeX, 0, 0]} rotation={[0, leafRot, 0]}>
        <mesh position={[ww / 2, hh / 2 + 0.005, 0.025]} castShadow receiveShadow>
          <boxGeometry args={[ww - 0.02, hh - 0.01, 0.045]} />
          <meshStandardMaterial color="#fbfaf7" roughness={0.6} />
        </mesh>
        {[0.049, 0.001].map((z) =>
          [
            [hh * 0.7, hh * 0.42],
            [hh * 0.24, hh * 0.32],
          ].map(([y, ph], i) => (
            <mesh key={`${z}-${i}`} position={[ww / 2, y, z]}>
              <boxGeometry args={[ww - 0.2, ph, 0.004]} />
              <meshStandardMaterial color="#f0ede7" roughness={0.7} />
            </mesh>
          )),
        )}
        {[
          [0.054, 0.07],
          [-0.004, -0.02],
        ].map(([zr, zl], i) => (
          <group key={i} position={[ww - 0.09, 1.02, 0]}>
            <mesh position={[0, 0, zr]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.028, 0.028, 0.012, 16]} />{metal}</mesh>
            <mesh position={[-0.05, 0, zl]}><boxGeometry args={[0.12, 0.018, 0.018]} />{metal}</mesh>
          </group>
        ))}
        {[0.25, hh / 2, hh - 0.25].map((y, i) => (
          <mesh key={i} position={[0.005, y, 0.025]}><cylinderGeometry args={[0.012, 0.012, 0.1, 10]} />{metal}</mesh>
        ))}
      </group>
      {/* hallway beyond the door: floor, walls, skirting and (when walking) a ceiling */}
      <group position={[cx, 0, 0]}>
        <mesh position={[0, 0, -1.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[3, 2.4]} />
          <meshStandardMaterial color="#6f4a3b" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, H / 2, -2.4]}>
          <planeGeometry args={[3, H]} />
          <meshStandardMaterial color={hall} roughness={1} side={THREE.DoubleSide} />
        </mesh>
        {[-1.5, 1.5].map((x) => (
          <mesh key={x} position={[x, H / 2, -1.2]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[2.4, H]} />
            <meshStandardMaterial color={hall} roughness={1} side={THREE.DoubleSide} />
          </mesh>
        ))}
        <mesh position={[0, 0.05, -2.385]}><boxGeometry args={[3, 0.1, 0.03]} />{trim}</mesh>
        {view === 'walk' && (
          <mesh position={[0, H, -1.2]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3, 2.4]} />
            <meshStandardMaterial color="#f3efe9" roughness={1} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    </group>
  )
}

/** Little wall stars like the ones in the photo (local wall coordinates). */
export function Stars({ room, side }: { room: Room; side: 'left' | 'right' }) {
  const pts = useMemo(() => {
    const out: [number, number, number][] = []
    let seed = side === 'left' ? 7 : 13
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
    for (let i = 0; i < 26; i++) out.push([0.3 + rnd() * (cm(room.d) - 0.6), 0.9 + rnd() * 1.4, 0.03 + rnd() * 0.05])
    return out
  }, [room.d, side])
  return (
    <group>
      {pts.map(([x, y, r], i) => (
        <mesh key={i} position={[x, y, 0.004]}>
          <circleGeometry args={[r, 5]} />
          <meshStandardMaterial color="#ffffff" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}
