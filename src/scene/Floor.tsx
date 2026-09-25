import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import type { Room } from '../types'
import { cm, shadeColor } from './util'

/* ---------------------------------- floor --------------------------------- */

export function useFloorTexture(color: string) {
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


export function Floor({ room, onDrag, onDrop }: { room: Room; onDrag?: (x: number, y: number) => void; onDrop: () => void }) {
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
