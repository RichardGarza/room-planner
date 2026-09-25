import * as THREE from 'three'
import { Environment, Lightformer } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { wallAxes, wallPoint } from '../geometry'
import type { Room } from '../types'
import { cm } from './util'

/* --------------------------------- lights --------------------------------- */

/*
 * Day and evening share one light rig (sun/moon, sky fill, ambient, pendant spot + spill)
 * and only change colours and intensities, so toggling never recompiles the materials.
 */

type Quality = 'best' | 'fast'

/** Direction (world) from the room out through the first window, and the window's centre. */
function windowFrame(room: Room) {
  const win = room.windows[0]
  const W = cm(room.w)
  if (!win) return { centre: new THREE.Vector3(W / 2, 1.5, 0), out: new THREE.Vector3(0, 0, -1), along: new THREE.Vector3(1, 0, 0) }
  const [px, py] = wallPoint(room, win.wall, win.offset + win.width / 2)
  const { normal, along } = wallAxes(win.wall)
  return {
    centre: new THREE.Vector3(cm(px), cm(win.sill + win.height / 2), cm(py)),
    out: new THREE.Vector3(-normal[0], 0, -normal[1]), // wallAxes' normal points into the room
    along: new THREE.Vector3(along[0], 0, along[1]),
  }
}

/** Sun (or moon): a directional light outside the window whose shadow frustum is fitted to the room box. */
function Sun({ room, quality, color, intensity, elevation, dir }: { room: Room; quality: Quality; color: string; intensity: number; elevation: number; dir: THREE.Vector3 }) {
  const ref = useRef<THREE.DirectionalLight>(null)
  const W = cm(room.w), D = cm(room.d), H = cm(room.h)
  const { position, target } = useMemo(() => {
    const { centre } = windowFrame(room)
    const d = dir.clone()
    d.y = 0
    d.normalize().multiplyScalar(Math.cos(elevation))
    d.y = Math.sin(elevation)
    return { target: new THREE.Vector3(W / 2, 0.4, D / 2), position: centre.clone().add(d.multiplyScalar(9)) }
  }, [room, dir, elevation, W, D])

  useLayoutEffect(() => {
    const light = ref.current
    if (!light) return
    light.target.position.copy(target)
    light.target.updateMatrixWorld()
    // Fit the orthographic shadow camera to the room's bounding box as seen from the light.
    const f = target.clone().sub(position).normalize()
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, f).normalize()
    let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity, n = Infinity, fa = -Infinity
    const m = 0.3
    for (const [x, y, z] of [[-m, -m, -m], [W + m, -m, -m], [-m, H + m, -m], [W + m, H + m, -m], [-m, -m, D + m], [W + m, -m, D + m], [-m, H + m, D + m], [W + m, H + m, D + m]]) {
      const v = new THREE.Vector3(x, y, z).sub(position)
      const px = v.dot(right), py = v.dot(up), pz = v.dot(f)
      l = Math.min(l, px); r = Math.max(r, px); b = Math.min(b, py); t = Math.max(t, py); n = Math.min(n, pz); fa = Math.max(fa, pz)
    }
    const cam = light.shadow.camera
    cam.left = l; cam.right = r; cam.bottom = b; cam.top = t
    cam.near = Math.max(0.1, n - 0.5); cam.far = fa + 0.5
    cam.updateProjectionMatrix()
    light.shadow.needsUpdate = true
  }, [position, target, W, D, H])

  const size = quality === 'best' ? 2048 : 1024
  return (
    <directionalLight
      ref={ref}
      position={position}
      color={color}
      intensity={intensity}
      castShadow
      shadow-mapSize={[size, size]}
      shadow-bias={-0.00015}
      shadow-normalBias={0.025}
      shadow-radius={quality === 'best' ? 3 : 1}
    />
  )
}

/** Pendant: a wide warm spot down from the shade (one shadow pass) plus a small unshadowed spill. */
function Pendant({ position, quality, on }: { position: [number, number, number]; quality: Quality; on: boolean }) {
  const ref = useRef<THREE.SpotLight>(null)
  useLayoutEffect(() => {
    const l = ref.current
    if (!l) return
    l.target.position.set(position[0], 0, position[2])
    l.target.updateMatrixWorld()
  }, [position])
  useLayoutEffect(() => {
    const l = ref.current
    if (!l) return
    // In the day the lamp is off: render its shadow map once (so the sampler is valid) and then leave it.
    l.shadow.autoUpdate = on
    l.shadow.needsUpdate = true
  }, [on])
  const size = quality === 'best' ? 1024 : 512
  return (
    <>
      <spotLight
        ref={ref}
        position={position}
        intensity={on ? 11 : 0}
        color="#ffcf98"
        angle={1.25}
        penumbra={0.75}
        decay={2}
        castShadow
        shadow-mapSize={[size, size]}
        shadow-bias={-0.0015}
        shadow-normalBias={0.03}
        shadow-camera-near={0.2}
        shadow-camera-far={8}
      />
      <pointLight position={[position[0], position[1] - 0.3, position[2]]} intensity={on ? 1.6 : 0} color="#ffd8b0" decay={2} />
    </>
  )
}

export function Lights({ room, daytime, quality }: { room: Room; daytime: boolean; quality: Quality }) {
  const W = cm(room.w), D = cm(room.d), H = cm(room.h)
  const { out, along } = useMemo(() => windowFrame(room), [room])
  const sunDir = useMemo(() => out.clone().add(along.clone().multiplyScalar(0.55)), [out, along])
  const moonDir = useMemo(() => out.clone().add(along.clone().multiplyScalar(-0.5)), [out, along])
  const envRes = quality === 'best' ? 128 : 64
  // Lightformer positions describe directions in the world frame (the env cube sits at the origin).
  const winDir: [number, number, number] = [out.x * 5, 1.2, out.z * 5]

  return (
    <>
      <ambientLight intensity={daytime ? 0.26 : 0.5} color={daytime ? '#fff1e4' : '#cfb8a6'} />
      <hemisphereLight color={daytime ? '#d9e6ff' : '#5d6a99'} groundColor={daytime ? '#cdb6a1' : '#6b4f3f'} intensity={daytime ? 0.85 : 0.55} />
      <Sun
        room={room}
        quality={quality}
        color={daytime ? '#fff1d8' : '#8fa3ff'}
        intensity={daytime ? 2.6 : 0.3}
        elevation={daytime ? 0.6 : 0.5}
        dir={daytime ? sunDir : moonDir}
      />
      <Pendant position={[W / 2, H - 0.56, D / 2]} quality={quality} on={!daytime} />
      {/* image-based light: bright window, sky above, warm floor bounce, neutral sides (day);
          a warm lamp overhead with a faint blue window (evening) */}
      {daytime ? (
        <Environment key="day" resolution={envRes} frames={1} environmentIntensity={0.8}>
          <Lightformer form="rect" intensity={3} color="#fff6ea" scale={[3.2, 2.4, 1]} position={winDir} target={[0, 0, 0]} />
          <Lightformer form="circle" intensity={1.2} color="#dfe9ff" scale={9} position={[0, 6, 0]} rotation-x={Math.PI / 2} />
          <Lightformer form="rect" intensity={0.5} color="#cdb59d" scale={[10, 10, 1]} position={[0, -6, 0]} rotation-x={-Math.PI / 2} />
          <Lightformer form="rect" intensity={0.4} color="#f3ece5" scale={[6, 3, 1]} position={[-6, 1, 0]} rotation-y={Math.PI / 2} />
          <Lightformer form="rect" intensity={0.4} color="#f3ece5" scale={[6, 3, 1]} position={[6, 1, 0]} rotation-y={-Math.PI / 2} />
          <Lightformer form="rect" intensity={0.35} color="#efe6dd" scale={[6, 3, 1]} position={[0, 1, 6]} rotation-y={Math.PI} />
        </Environment>
      ) : (
        <Environment key="night" resolution={envRes} frames={1} environmentIntensity={0.5}>
          <Lightformer form="circle" intensity={2.5} color="#ffc98f" scale={2.2} position={[0, 5, 0]} rotation-x={Math.PI / 2} />
          <Lightformer form="rect" intensity={0.6} color="#5d6fbf" scale={[3, 2.2, 1]} position={winDir} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={0.3} color="#6b5a4e" scale={[10, 10, 1]} position={[0, -6, 0]} rotation-x={-Math.PI / 2} />
          <Lightformer form="rect" intensity={0.2} color="#4d4a5c" scale={[6, 3, 1]} position={[-6, 1, 0]} rotation-y={Math.PI / 2} />
          <Lightformer form="rect" intensity={0.2} color="#4d4a5c" scale={[6, 3, 1]} position={[6, 1, 0]} rotation-y={-Math.PI / 2} />
        </Environment>
      )}
    </>
  )
}
