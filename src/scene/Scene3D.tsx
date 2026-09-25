import { Canvas } from '@react-three/fiber'
import { useState } from 'react'
import { useStore } from '../store'
import { Lights } from './Lights'
import { OutsideCamera, WalkControls } from './Cameras'
import { Shell } from './Shell'
import { Floor } from './Floor'
import { Furniture } from './Furniture'

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
