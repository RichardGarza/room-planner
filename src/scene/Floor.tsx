import * as THREE from 'three'
import { useLayoutEffect, useMemo } from 'react'
import { useStore } from '../store'
import type { Room } from '../types'
import { groundFadeTexture, PLANK_GAIN, plankMaps } from './textures'
import { cm } from './util'

/* ---------------------------------- floor --------------------------------- */

/**
 * Oak planks, 12 × 120 cm, running front to back. The plank maps are one neutral set per
 * quality level; the room's floor colour comes in through the material colour (which
 * multiplies the map), so picking a colour never builds new textures.
 */
export function useFloorMaps(detail: 'best' | 'fast', W: number, D: number) {
  const maps = useMemo(() => plankMaps(detail), [detail])
  useLayoutEffect(() => {
    for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) t.repeat.set(W / maps.tile[0], D / maps.tile[1])
  }, [maps, W, D])
  return maps
}

/** The floor colour with the gain the neutral map was divided by (THREE.Color happily holds values above 1). */
export function floorTint(color: string) {
  return new THREE.Color(color).multiplyScalar(PLANK_GAIN)
}

export function Floor({ room }: { room: Room }) {
  const quality = useStore((s) => s.quality)
  const W = cm(room.w), D = cm(room.d)
  const maps = useFloorMaps(quality, W, D)
  const tint = useMemo(() => floorTint(room.floorColor), [room.floorColor])
  const fade = groundFadeTexture()
  return (
    <>
      <mesh position={[W / 2, 0, D / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial
          color={tint}
          map={maps.map}
          normalMap={maps.normalMap}
          normalScale={quality === 'best' ? [0.9, 0.9] : [0.6, 0.6]}
          roughnessMap={maps.roughnessMap}
          roughness={1}
          metalness={0}
          envMapIntensity={0.7}
        />
      </mesh>
      {/* a soft ground disc under the room so it does not float in a void (outside views only see it);
          it is drawn only where no window or door mask has written the stencil, so it never shows
          through the glass over the garden or through the doorway over the hall */}
      <mesh position={[W / 2, -0.006, D / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-5}>
        <circleGeometry args={[12, 48]} />
        <meshBasicMaterial
          color="#dcd5cc"
          alphaMap={fade}
          transparent
          depthWrite={false}
          stencilWrite
          stencilWriteMask={0}
          stencilRef={0}
          stencilFunc={THREE.EqualStencilFunc}
        />
      </mesh>
    </>
  )
}
