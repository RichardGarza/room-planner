import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { rectOf, wallLength } from '../geometry'
import { useStore, type OutsideAngle } from '../store'
import type { Item, Room, Wall } from '../types'

const cm = (v: number) => v / 100
const WALL_T = 0.12

/* ---------------------------------- root ---------------------------------- */

export function Scene3D() {
  const quality = useStore((s) => s.quality)
  const view = useStore((s) => s.view)
  return (
    <Canvas
      shadows={quality === 'best'}
      dpr={quality === 'best' ? [1, 2] : [1, 1]}
      camera={{ fov: 55, near: 0.05, far: 60, position: [-1.8, 3.6, 5.6] }}
      onPointerMissed={() => useStore.getState().select(null)}
      style={{ cursor: view === 'walk' ? 'move' : 'default' }}
    >
      <SceneContents />
    </Canvas>
  )
}

function SceneContents() {
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const view = useStore((s) => s.view)
  const daytime = useStore((s) => s.daytime)
  const [dragId, setDragId] = useState<string | null>(null)

  return (
    <>
      <Lights room={room} daytime={daytime} />
      {view === 'outside' ? <OutsideCamera room={room} locked={dragId !== null} /> : <WalkControls room={room} items={items} />}
      <Shell room={room} />
      <Floor room={room} onDrag={dragId ? (x, y) => useStore.getState().dragTo(dragId, x, y) : undefined} onDrop={() => setDragId(null)} />
      {items.filter((i) => i.inRoom).map((it) => (
        <Furniture key={it.id} item={it} onStartDrag={view === 'outside' ? () => setDragId(it.id) : undefined} />
      ))}
    </>
  )
}

/* --------------------------------- lights --------------------------------- */

function Lights({ room, daytime }: { room: Room; daytime: boolean }) {
  const cx = cm(room.w) / 2, cz = cm(room.d) / 2
  const wx = cm(room.window.offset + room.window.width / 2)
  return daytime ? (
    <>
      <ambientLight intensity={0.55} color="#fff6ea" />
      <hemisphereLight args={['#dbe8ff', '#d3c2b6', 0.7]} />
      <directionalLight
        position={[wx + 0.4, 4.5, -3.5]}
        target-position={[wx, 0.6, 1.8]}
        intensity={2.2}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <pointLight position={[cx, cm(room.h) - 0.3, cz]} intensity={0.35} color="#fff" distance={6} />
    </>
  ) : (
    <>
      <ambientLight intensity={0.18} color="#d9c7ff" />
      <hemisphereLight args={['#2a3350', '#3a2a22', 0.35]} />
      <pointLight position={[cx, cm(room.h) - 0.25, cz]} intensity={3.5} color="#ffd6a0" distance={7} decay={1.6} castShadow shadow-bias={-0.0006} />
      <pointLight position={[wx, 1.6, -1.2]} intensity={0.5} color="#7c8fdd" distance={5} />
    </>
  )
}

/* --------------------------------- cameras -------------------------------- */

const anglePositions = (room: Room): Record<OutsideAngle, [number, number, number]> => {
  const W = cm(room.w), D = cm(room.d)
  return {
    corner: [-1.9, 3.6, D + 2.2],
    above: [W / 2, 6.2, D / 2 + 0.01],
    window: [W / 2, 2.6, -3.2],
    door: [W / 2, 2.4, D + 3.4],
  }
}

function OutsideCamera({ room, locked }: { room: Room; locked: boolean }) {
  const angle = useStore((s) => s.outsideAngle)
  const camera = useThree((s) => s.camera)
  const controls = useRef<any>(null)
  const target = useMemo(() => new THREE.Vector3(cm(room.w) / 2, 0.8, cm(room.d) / 2), [room])
  useEffect(() => {
    const p = anglePositions(room)[angle]
    camera.position.set(...p)
    camera.lookAt(target)
    controls.current?.target.copy(target)
    controls.current?.update()
  }, [angle, room, camera, target])
  return <OrbitControls ref={controls} makeDefault enabled={!locked} target={target} maxPolarAngle={Math.PI / 2 - 0.05} minDistance={1.5} maxDistance={14} enableDamping dampingFactor={0.12} />
}

function WalkControls({ room, items }: { room: Room; items: Item[] }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const keys = useRef<Set<string>>(new Set())
  const walkHeight = useStore((s) => s.walkHeight)

  useEffect(() => {
    const el = gl.domElement
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => { last = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId) }
    const move = (e: PointerEvent) => {
      if (!last) return
      const dx = e.clientX - last.x, dy = e.clientY - last.y
      last = { x: e.clientX, y: e.clientY }
      const p = useStore.getState().walkPose
      useStore.getState().setWalkPose({ yaw: p.yaw - dx * 0.004, pitch: THREE.MathUtils.clamp(p.pitch - dy * 0.004, -1.2, 1.2) })
    }
    const up = () => { last = null }
    const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName !== 'INPUT') keys.current.add(e.key.toLowerCase()) }
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [gl])

  useFrame((_, dt) => {
    const st = useStore.getState()
    const p = st.walkPose
    const k = keys.current
    const speed = 130 * Math.min(dt, 0.05) // cm per second
    let fwd = 0, side = 0
    if (k.has('w') || k.has('arrowup')) fwd += 1
    if (k.has('s') || k.has('arrowdown')) fwd -= 1
    if (k.has('d') || k.has('arrowright')) side += 1
    if (k.has('a') || k.has('arrowleft')) side -= 1
    let x = p.x, y = p.y
    if (fwd || side) {
      // camera looks along (-sin yaw, -cos yaw) in plan (x, y=z)
      const fx = -Math.sin(p.yaw), fy = -Math.cos(p.yaw)
      const rx = Math.cos(p.yaw), ry = -Math.sin(p.yaw)
      const nx = x + (fx * fwd + rx * side) * speed
      const ny = y + (fy * fwd + ry * side) * speed
      const blocked = (px: number, py: number) => {
        if (px < 20 || px > room.w - 20 || py < 20 || py > room.d - 20) return true
        return items.some((it) => {
          if (!it.inRoom || it.kind === 'rug') return false
          const r = rectOf(it)
          return px > r.x0 - 12 && px < r.x1 + 12 && py > r.y0 - 12 && py < r.y1 + 12
        })
      }
      if (!blocked(nx, y)) x = nx
      if (!blocked(x, ny)) y = ny
      if (x !== p.x || y !== p.y) st.setWalkPose({ x, y })
    }
    const eye = walkHeight === 'adult' ? 1.62 : 1.08
    camera.position.set(cm(x), eye, cm(y))
    camera.rotation.order = 'YXZ'
    camera.rotation.set(p.pitch, p.yaw, 0)
  })
  return null
}

/* ---------------------------------- shell --------------------------------- */

/**
 * Each wall gets a group whose local x runs along the wall (increasing offset),
 * local y is up and local +z points into the room. Everything on the wall is built
 * in those local coordinates, so a window or door can sit on any wall.
 */
function wallTransform(room: Room, wall: Wall): { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] } {
  const W = cm(room.w), D = cm(room.d)
  switch (wall) {
    case 'top': return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    case 'bottom': return { position: [0, 0, D], rotation: [0, Math.PI, 0], scale: [-1, 1, 1] }
    case 'left': return { position: [0, 0, 0], rotation: [0, -Math.PI / 2, 0], scale: [1, 1, -1] }
    case 'right': return { position: [W, 0, 0], rotation: [0, -Math.PI / 2, 0], scale: [1, 1, 1] }
  }
}

function Shell({ room }: { room: Room }) {
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
function WallFace({ room, wall, daytime }: { room: Room; wall: Wall; daytime: boolean }) {
  const L = cm(wallLength(room, wall)), H = cm(room.h)
  const color = room.wallColors[wall]
  const openings = [room.window, room.door].filter((o) => o.wall === wall)
  const mat = <meshStandardMaterial color={color} roughness={0.95} />

  // Solid pieces: split the wall at each opening's edges.
  const pieces: [number, number, number, number][] = [] // cx, cy, w, h
  let cursor = 0
  for (const o of [...openings].sort((a, b) => a.offset - b.offset)) {
    const o0 = cm(o.offset), o1 = cm(o.offset + o.width)
    const s = cm(o.sill), t = cm(o.sill + o.height)
    if (o0 > cursor) pieces.push([(cursor + o0) / 2, H / 2, o0 - cursor, H])
    if (s > 0) pieces.push([(o0 + o1) / 2, s / 2, o1 - o0, s])
    if (t < H) pieces.push([(o0 + o1) / 2, (t + H) / 2, o1 - o0, H - t])
    cursor = o1
  }
  if (cursor < L) pieces.push([(cursor + L) / 2, H / 2, L - cursor, H])

  return (
    <group>
      {pieces.map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, -WALL_T / 2]} receiveShadow castShadow>
          <boxGeometry args={[w + (i === 0 || i === pieces.length - 1 ? WALL_T : 0), h, WALL_T]} />
          {mat}
        </mesh>
      ))}
      {/* skirting */}
      <mesh position={[L / 2, 0.04, 0.01]}><boxGeometry args={[L, 0.08, 0.02]} /><meshStandardMaterial color="#f8f6f2" /></mesh>
      {room.window.wall === wall && <Window room={room} daytime={daytime} />}
      {room.radiator.wall === wall && <Radiator room={room} />}
      {room.door.wall === wall && <Doorway room={room} />}
      {(wall === 'left' || wall === 'right') && <Stars room={room} side={wall} />}
    </group>
  )
}

function Window({ room, daytime }: { room: Room; daytime: boolean }) {
  const blinds = useStore((s) => s.blinds)
  const w = room.window
  const x0 = cm(w.offset), ww = cm(w.width), s = cm(w.sill), hh = cm(w.height)
  const cx = x0 + ww / 2, cy = s + hh / 2
  const frame = '#fbfbfb'
  const blindH = (hh * blinds) / 100
  return (
    <group>
      {/* glass */}
      <mesh position={[cx, cy, -0.02]}>
        <planeGeometry args={[ww, hh]} />
        <meshPhysicalMaterial color="#cfe3f5" transparent opacity={0.28} roughness={0.05} metalness={0.1} side={THREE.DoubleSide} />
      </mesh>
      {/* outside backdrop: sky and garden */}
      <mesh position={[cx, cy + 0.6, -0.9]}>
        <planeGeometry args={[ww + 2.5, hh + 2.5]} />
        <meshBasicMaterial color={daytime ? '#d9e9ff' : '#141b33'} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[cx, s - 0.2, -0.85]}>
        <planeGeometry args={[ww + 2.5, 1.2]} />
        <meshBasicMaterial color={daytime ? '#8fb27a' : '#1c2a22'} side={THREE.DoubleSide} />
      </mesh>
      {/* frame */}
      {[
        [cx, s + 0.025, ww + 0.1, 0.05],
        [cx, s + hh - 0.025, ww + 0.1, 0.05],
        [x0 + 0.025, cy, 0.05, hh],
        [x0 + ww - 0.025, cy, 0.05, hh],
        [x0 + ww / 3, cy, 0.03, hh],
        [x0 + (2 * ww) / 3, cy, 0.03, hh],
      ].map(([x, y, fw, fh], i) => (
        <mesh key={i} position={[x, y, -0.03]}><boxGeometry args={[fw, fh, 0.06]} /><meshStandardMaterial color={frame} /></mesh>
      ))}
      {/* sill */}
      <mesh position={[cx, s - 0.015, 0.06]} castShadow><boxGeometry args={[ww + 0.16, 0.03, 0.22]} /><meshStandardMaterial color={frame} /></mesh>
      {/* roller blind */}
      <mesh position={[cx, s + hh + 0.04, 0.05]}><boxGeometry args={[ww + 0.12, 0.08, 0.08]} /><meshStandardMaterial color="#ecebe7" /></mesh>
      {blindH > 0.01 && (
        <mesh position={[cx, s + hh - blindH / 2, 0.045]}>
          <planeGeometry args={[ww + 0.08, blindH]} />
          <meshStandardMaterial color="#f0ede6" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* curtain */}
      <mesh position={[x0 - 0.18, s + hh / 2 + 0.2, 0.09]} castShadow>
        <boxGeometry args={[0.3, hh + 0.9, 0.12]} />
        <meshStandardMaterial color="#dcd7d0" roughness={1} />
      </mesh>
    </group>
  )
}

function Radiator({ room }: { room: Room }) {
  const r = room.radiator
  const x0 = cm(r.offset), w = cm(r.width), h = cm(r.height), d = cm(r.depth)
  const fins = Math.max(4, Math.floor(r.width / 8))
  return (
    <group position={[x0 + w / 2, 0.14 + h / 2, d / 2 + 0.02]}>
      <mesh castShadow><boxGeometry args={[w, h, d * 0.5]} /><meshStandardMaterial color="#f4f4f2" /></mesh>
      {Array.from({ length: fins }, (_, i) => (
        <mesh key={i} position={[-w / 2 + (i + 0.5) * (w / fins), 0, 0]}>
          <boxGeometry args={[w / fins - 0.012, h * 0.92, d]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  )
}

function Doorway({ room }: { room: Room }) {
  const doorAngle = useStore((s) => s.doorAngle)
  const d = room.door
  const x0 = cm(d.offset), ww = cm(d.width), hh = cm(d.height)
  const cx = x0 + ww / 2
  // hinge 'left' = smaller offset; the leaf opens into the room (local +z)
  const hingeX = d.hinge === 'left' ? x0 : x0 + ww
  const phi = (doorAngle * Math.PI) / 180
  const leafRot = d.hinge === 'left' ? -phi : Math.PI + phi
  return (
    <group>
      {/* frame */}
      {[
        [x0 - 0.03, hh / 2, 0.06, hh],
        [x0 + ww + 0.03, hh / 2, 0.06, hh],
        [cx, hh + 0.03, ww + 0.12, 0.06],
      ].map(([x, y, fw, fh], i) => (
        <mesh key={i} position={[x, y, -WALL_T / 2]}><boxGeometry args={[fw, fh, WALL_T + 0.04]} /><meshStandardMaterial color="#fbfaf7" /></mesh>
      ))}
      {/* leaf */}
      <group position={[hingeX, 0, 0]} rotation={[0, leafRot, 0]}>
        <mesh position={[ww / 2, hh / 2, 0.025]} castShadow receiveShadow>
          <boxGeometry args={[ww - 0.02, hh, 0.045]} />
          <meshStandardMaterial color="#fbfaf7" roughness={0.6} />
        </mesh>
        <mesh position={[ww - 0.1, 1.02, 0.06]}>
          <sphereGeometry args={[0.025, 12, 8]} />
          <meshStandardMaterial color="#8d8d8d" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
      {/* hallway beyond the door */}
      <mesh position={[cx, 0, -1.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3, 2.4]} />
        <meshStandardMaterial color="#6f4a3b" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[cx, cm(room.h) / 2, -2.4]}>
        <planeGeometry args={[3, cm(room.h)]} />
        <meshStandardMaterial color="#bdb7b0" roughness={1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** Little wall stars like the ones in the photo (local wall coordinates). */
function Stars({ room, side }: { room: Room; side: 'left' | 'right' }) {
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

/* ---------------------------------- floor --------------------------------- */

function useFloorTexture(color: string) {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 512
    const g = c.getContext('2d')!
    g.fillStyle = color
    g.fillRect(0, 0, 512, 512)
    const plank = 64
    for (let row = 0; row < 512 / plank; row++) {
      const offset = (row % 2) * 160
      for (let x = -256; x < 512; x += 256) {
        const shade = 0.85 + ((row * 7 + x) % 5) * 0.06
        g.fillStyle = shadeColor(color, shade)
        g.fillRect(x + offset, row * plank, 256 - 3, plank - 3)
      }
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [color])
}

function shadeColor(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 255) * f), g = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f)
  return `rgb(${r | 0},${g | 0},${b | 0})`
}

function Floor({ room, onDrag, onDrop }: { room: Room; onDrag?: (x: number, y: number) => void; onDrop: () => void }) {
  const W = cm(room.w), D = cm(room.d)
  const tex = useFloorTexture(room.floorColor)
  useEffect(() => { tex.repeat.set(W / 1.6, D / 1.6) }, [tex, W, D])
  return (
    <>
      <mesh position={[W / 2, 0, D / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={tex} roughness={0.55} />
      </mesh>
      {/* invisible drag catcher */}
      {onDrag && (
        <mesh
          position={[W / 2, 0.001, D / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerMove={(e) => { e.stopPropagation(); onDrag(e.point.x * 100, e.point.z * 100) }}
          onPointerUp={(e) => { e.stopPropagation(); onDrop() }}
        >
          <planeGeometry args={[W + 6, D + 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}

/* -------------------------------- furniture ------------------------------- */

function Furniture({ item, onStartDrag }: { item: Item; onStartDrag?: () => void }) {
  const selected = useStore((s) => s.selectedId === item.id)
  const bedding = useStore((s) => s.bedding)
  const select = useStore((s) => s.select)
  const snapshot = useStore((s) => s.snapshot)
  const [hover, setHover] = useState(false)

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    select(item.id)
    if (onStartDrag) { snapshot(); onStartDrag() }
  }
  const emissive = selected ? '#ff7a3d' : hover ? '#ffb27a' : '#000000'
  const ei = selected ? 0.22 : hover ? 0.12 : 0
  const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => (
    <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={ei} roughness={0.8} {...extra} />
  )
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)

  let body: React.ReactNode
  switch (item.kind) {
    case 'bed':
      body = (
        <>
          <mesh position={[0, 0.18, 0]} castShadow receiveShadow><boxGeometry args={[w, 0.36, d]} />{mat('#f4f1ec')}</mesh>
          <mesh position={[0, 0.46, 0.03]} castShadow receiveShadow><boxGeometry args={[w - 0.12, 0.2, d - 0.16]} />{mat('#fbfaf8')}</mesh>
          <mesh position={[0, h / 2, -d / 2 + 0.04]} castShadow receiveShadow><boxGeometry args={[w, h, 0.08]} />{mat('#ece7e0')}</mesh>
          {bedding && (
            <>
              <mesh position={[0, 0.6, d * 0.12]} castShadow receiveShadow><boxGeometry args={[w - 0.16, 0.09, d * 0.62]} />{mat(item.color, { roughness: 1 })}</mesh>
              <mesh position={[-w / 4 + 0.03, 0.6, -d / 2 + 0.32]} castShadow><boxGeometry args={[w / 2 - 0.16, 0.1, 0.4]} />{mat('#ffffff', { roughness: 1 })}</mesh>
              <mesh position={[w / 4 - 0.03, 0.6, -d / 2 + 0.32]} castShadow><boxGeometry args={[w / 2 - 0.16, 0.1, 0.4]} />{mat('#ffffff', { roughness: 1 })}</mesh>
            </>
          )}
        </>
      )
      break
    case 'chair':
      body = (
        <>
          <mesh position={[0, 0.02, 0]} castShadow><cylinderGeometry args={[w / 2.2, w / 2.2, 0.04, 20]} />{mat('#d8d8d8')}</mesh>
          <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.02, 0.02, 0.42, 8]} />{mat('#b8b8b8')}</mesh>
          <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[w * 0.8, 0.06, d * 0.8]} />{mat(item.color)}</mesh>
          <mesh position={[0, 0.5 + (h - 0.5) / 2, -d * 0.36]} castShadow><boxGeometry args={[w * 0.75, h - 0.5, 0.06]} />{mat(item.color)}</mesh>
        </>
      )
      break
    case 'desk':
      body = (
        <>
          <mesh position={[0, h - 0.015, 0]} castShadow receiveShadow><boxGeometry args={[w, 0.03, d]} />{mat(item.color)}</mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} position={[sx * (w / 2 - 0.03), (h - 0.03) / 2, sz * (d / 2 - 0.03)]} castShadow>
              <boxGeometry args={[0.04, h - 0.03, 0.04]} />
              {mat('#e7e2da')}
            </mesh>
          ))}
        </>
      )
      break
    case 'rug':
      body = (
        <mesh position={[0, 0.006, 0]} receiveShadow>
          <cylinderGeometry args={[w / 2, w / 2, 0.012, 40]} />
          {mat(item.color, { roughness: 1 })}
        </mesh>
      )
      break
    case 'bookcase':
    case 'shelf': {
      const shelves = Math.max(2, Math.round(item.h / 32))
      body = (
        <>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} />{mat(item.color)}</mesh>
          {Array.from({ length: shelves }, (_, i) => (
            <mesh key={i} position={[0, ((i + 0.5) * h) / shelves, d / 2 + 0.002]}>
              <boxGeometry args={[w - 0.05, h / shelves - 0.05, 0.004]} />
              {mat(i % 2 ? '#d9e6f2' : '#f2d9e4', { roughness: 1 })}
            </mesh>
          ))}
        </>
      )
      break
    }
    case 'dresser':
      body = (
        <>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} />{mat(item.color)}</mesh>
          {[0.25, 0.5, 0.75].map((f, i) => (
            <mesh key={i} position={[0, h * f, d / 2 + 0.003]}>
              <boxGeometry args={[w - 0.06, 0.012, 0.006]} />
              {mat('#cfc7bd')}
            </mesh>
          ))}
        </>
      )
      break
    case 'wardrobe':
      body = (
        <>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} />{mat(item.color)}</mesh>
          <mesh position={[0, h / 2, d / 2 + 0.003]}><boxGeometry args={[0.01, h - 0.06, 0.006]} />{mat('#cfc7bd')}</mesh>
          <mesh position={[-0.05, h * 0.5, d / 2 + 0.02]}><boxGeometry args={[0.02, 0.12, 0.03]} />{mat('#9c9c9c')}</mesh>
          <mesh position={[0.05, h * 0.5, d / 2 + 0.02]}><boxGeometry args={[0.02, 0.12, 0.03]} />{mat('#9c9c9c')}</mesh>
        </>
      )
      break
    default:
      body = <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} />{mat(item.color)}</mesh>
  }

  return (
    <group
      position={[cm(item.x), 0, cm(item.y)]}
      rotation={[0, (-item.rot * Math.PI) / 180, 0]}
      onPointerDown={onDown}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true) }}
      onPointerOut={() => setHover(false)}
    >
      {body}
    </group>
  )
}
