import type { Item } from '../../types'
import { cm } from '../util'
import { mix, shade } from './layout'
import { fringeStripes, rugWeave, useFx, useTiled } from './materials'
import { useSeg } from './props'

/** Woven rug material: the weave texture tinted with the rug colour. */
function Weave({ color, rx, ry }: { color: string; rx: number; ry: number }) {
  const { emissive, ei } = useFx()
  const map = useTiled(rugWeave, rx, ry)
  return <meshStandardMaterial map={map} color={color} roughness={1} emissive={emissive} emissiveIntensity={ei} />
}

/** Each rug sits a little higher than the one before it in the item list so overlapping rugs never z-fight. */
const STACK = 0.0012

/** Round rug: thin disc with a darker border ring and a woven centre. */
export function RoundRug({ item, stack = 0 }: { item: Item; stack?: number }) {
  const { emissive, ei } = useFx()
  const R = cm(item.w) / 2
  const seg = useSeg(64)
  const border = Math.min(0.08, R * 0.12)
  return (
    <group position={[0, stack * STACK, 0]}>
      <mesh position={[0, 0.006, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[R, R, 0.012, seg]} />
        <meshStandardMaterial color={shade(item.color, 0.72)} roughness={1} emissive={emissive} emissiveIntensity={ei} />
      </mesh>
      <mesh position={[0, 0.008, 0]} receiveShadow>
        <cylinderGeometry args={[R - border, R - border, 0.012, seg]} />
        <Weave color={item.color} rx={R / 0.2} ry={R / 0.2} />
      </mesh>
    </group>
  )
}

/** Rectangular rug: bordered woven body with a fringe strip at both short ends. */
export function RectRug({ item, stack = 0 }: { item: Item; stack?: number }) {
  const { emissive, ei } = useFx()
  const w = cm(item.w), d = cm(item.d)
  const fringe = 0.05
  const bodyD = d - 2 * fringe
  const border = Math.min(0.08, Math.min(w, d) * 0.08)
  const stripes = useTiled(fringeStripes, w / 0.05, 1)
  return (
    <group position={[0, stack * STACK, 0]}>
      <mesh position={[0, 0.006, 0]} receiveShadow castShadow>
        <boxGeometry args={[w, 0.012, bodyD]} />
        <meshStandardMaterial color={shade(item.color, 0.72)} roughness={1} emissive={emissive} emissiveIntensity={ei} />
      </mesh>
      <mesh position={[0, 0.008, 0]} receiveShadow>
        <boxGeometry args={[w - 2 * border, 0.012, bodyD - 2 * border]} />
        <Weave color={item.color} rx={w / 0.2} ry={d / 0.2} />
      </mesh>
      {[-1, 1].map((sz) => (
        <mesh key={sz} position={[0, 0.004, sz * (d / 2 - fringe / 2)]} receiveShadow={false}>
          <boxGeometry args={[w - 0.02, 0.006, fringe]} />
          <meshStandardMaterial map={stripes} color={mix(item.color, '#ffffff', 0.55)} roughness={1} emissive={emissive} emissiveIntensity={ei} />
        </mesh>
      ))}
    </group>
  )
}
