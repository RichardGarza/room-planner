import { useLayoutEffect, useMemo } from 'react'
import { useStore } from '../store'
import type { Room } from '../types'
import { plankMaps } from './textures'
import { cm } from './util'

/* ---------------------------------- floor --------------------------------- */

/** Oak planks tinted by the room's floor colour, 12 × 120 cm, running front to back. */
export function useFloorMaps(color: string, detail: 'best' | 'fast', W: number, D: number) {
  const maps = useMemo(() => plankMaps(color, detail), [color, detail])
  useLayoutEffect(() => {
    for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) t.repeat.set(W / maps.tile[0], D / maps.tile[1])
  }, [maps, W, D])
  return maps
}

export function Floor({ room, onDrag, onDrop }: { room: Room; onDrag?: (x: number, y: number) => void; onDrop: () => void }) {
  const quality = useStore((s) => s.quality)
  const W = cm(room.w), D = cm(room.d)
  const maps = useFloorMaps(room.floorColor, quality, W, D)
  return (
    <>
      <mesh position={[W / 2, 0, D / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial
          map={maps.map}
          normalMap={maps.normalMap}
          normalScale={quality === 'best' ? [0.9, 0.9] : [0.6, 0.6]}
          roughnessMap={maps.roughnessMap}
          roughness={1}
          metalness={0}
          envMapIntensity={0.7}
        />
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
