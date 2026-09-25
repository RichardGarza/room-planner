import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Lights } from './Lights'
import { OutsideCamera, WalkControls } from './Cameras'
import { Shell } from './Shell'
import { Floor } from './Floor'
import { Furniture } from './Furniture'
import { Effects } from './Effects'
import { cm } from './util'

/* ---------------------------------- root ---------------------------------- */

const glProps = {
  antialias: true,
  stencil: true, // the world outside the windows is masked through the glass
  powerPreference: 'high-performance' as const,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.1,
  outputColorSpace: THREE.SRGBColorSpace,
}

export function Scene3D() {
  const quality = useStore((s) => s.quality)
  const view = useStore((s) => s.view)
  return (
    <Canvas
      gl={glProps}
      shadows="percentage"
      frameloop="demand"
      dpr={quality === 'best' ? [1, 1.5] : [1, 1]}
      camera={{ fov: 55, near: 0.05, far: 80, position: [-1.8, 3.6, 5.6] }}
      onPointerMissed={() => useStore.getState().select(null)}
      style={{ cursor: view === 'walk' ? 'move' : 'default' }}
    >
      <SceneContents />
    </Canvas>
  )
}

/** Dev-only: expose renderer stats so a headless run can check the draw-call budget. */
function DevStats() {
  const gl = useThree((s) => s.gl)
  useEffect(() => { gl.info.autoReset = false; return () => { gl.info.autoReset = true } }, [gl])
  useFrame(() => {
    // runs before this frame renders, so the counters hold the whole previous frame (all passes)
    const w = window as unknown as { __rp?: { calls: number; triangles: number } }
    w.__rp = { calls: gl.info.render.calls, triangles: gl.info.render.triangles }
    gl.info.reset()
  })
  return null
}

function SceneContents() {
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const view = useStore((s) => s.view)
  const daytime = useStore((s) => s.daytime)
  const quality = useStore((s) => s.quality)
  const [dragId, setDragId] = useState<string | null>(null)
  const W = cm(room.w), D = cm(room.d)
  const best = quality === 'best'

  return (
    <>
      <color attach="background" args={[daytime ? '#e9e3dc' : '#d6cfc8']} />
      <Lights room={room} daytime={daytime} quality={quality} />
      {view === 'outside' ? <OutsideCamera room={room} locked={dragId !== null} /> : <WalkControls room={room} items={items} />}
      <Shell room={room} />
      <Floor room={room} onDrag={dragId ? (x, y) => useStore.getState().dragTo(dragId, x, y) : undefined} onDrop={() => setDragId(null)} />
      {items.filter((i) => i.inRoom).map((it) => (
        <Furniture key={it.id} item={it} onStartDrag={view === 'outside' ? () => setDragId(it.id) : undefined} />
      ))}
      {best && (
        <ContactShadows position={[W / 2, 0.012, D / 2]} scale={[W, D]} far={1.6} blur={2.2} opacity={daytime ? 0.32 : 0.22} resolution={512} color="#3a2417" frames={Infinity} />
      )}
      {best && <Effects daytime={daytime} />}
      {import.meta.env.DEV && <DevStats />}
    </>
  )
}
