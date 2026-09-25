import { Instance, Instances } from '@react-three/drei'
import type { Item } from '../../types'
import { cm } from '../util'
import { chairStyle, isWoodTone, mix, shade } from './layout'
import { Fabric, Metal, Painted, Plastic, Surface, useFx } from './materials'
import { Box, Cyl, Legs, RBox, useSeg } from './props'

export function Chair({ item }: { item: Item }) {
  return chairStyle(item.name, item.w, item.d, item.h) === 'desk' ? <DeskChair item={item} /> : <DiningChair item={item} />
}

/** Swivel chair: five-star base with wheels, gas lift, cushioned seat, curved backrest, armrests. */
function DeskChair({ item }: { item: Item }) {
  const { emissive, ei } = useFx()
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const seatH = Math.min(0.48, h * 0.55)
  const armR = w / 2 - 0.03
  const backH = h - seatH - 0.04
  const R = d * 0.7
  const theta = 1.15
  const seg = useSeg(24)
  const dark = '#3a3d42'
  return (
    <>
      {/* five-star base + wheels as two instanced batches */}
      <Instances limit={5} castShadow receiveShadow>
        <boxGeometry args={[armR, 0.024, 0.04]} />
        <meshStandardMaterial color={dark} roughness={0.45} metalness={0.1} emissive={emissive} emissiveIntensity={ei} />
        {Array.from({ length: 5 }, (_, i) => {
          const a = (i * Math.PI * 2) / 5
          return <Instance key={i} position={[Math.cos(a) * armR * 0.5, 0.045, Math.sin(a) * armR * 0.5]} rotation={[0, -a, 0]} />
        })}
      </Instances>
      <Instances limit={5} castShadow>
        <sphereGeometry args={[0.026, 12, 10]} />
        <meshStandardMaterial color="#2a2c30" roughness={0.5} emissive={emissive} emissiveIntensity={ei} />
        {Array.from({ length: 5 }, (_, i) => {
          const a = (i * Math.PI * 2) / 5
          return <Instance key={i} position={[Math.cos(a) * armR, 0.026, Math.sin(a) * armR]} />
        })}
      </Instances>
      <Cyl r={0.05} h={0.03} at={[0, 0.06, 0]} seg={16}><Plastic color={dark} /></Cyl>
      <Cyl r={0.026} h={seatH - 0.16} at={[0, 0.07 + (seatH - 0.16) / 2, 0]} seg={12}><Metal /></Cyl>
      <Cyl r={0.034} h={0.1} at={[0, 0.12, 0]} seg={12}><Plastic color={dark} /></Cyl>
      <Box size={[0.26, 0.02, 0.26]} at={[0, seatH - 0.09, 0]}><Plastic color={dark} /></Box>
      {/* seat cushion */}
      <RBox size={[w * 0.86, 0.09, d * 0.86]} at={[0, seatH - 0.045, 0.01]} radius={0.035}><Fabric color={item.color} /></RBox>
      {/* support arm bending up into the backrest */}
      <Box size={[0.08, 0.025, d * 0.3]} at={[0, seatH - 0.1, -d * 0.25]}><Plastic color={dark} /></Box>
      <Box size={[0.08, backH * 0.45, 0.025]} at={[0, seatH - 0.1 + backH * 0.22, -d * 0.4]} rot={[-0.08, 0, 0]}><Plastic color={dark} /></Box>
      {/* curved backrest: dark shell with a fabric cushion in front */}
      <group position={[0, seatH + backH / 2 + 0.01, -d * 0.44 + R]} rotation={[-0.08, 0, 0]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[R, R, backH, seg, 1, true, Math.PI - theta / 2, theta]} />
          <meshStandardMaterial color={dark} roughness={0.45} metalness={0.1} emissive={emissive} emissiveIntensity={ei} side={2} />
        </mesh>
        <mesh position={[0, 0, 0.018]} castShadow receiveShadow>
          <cylinderGeometry args={[R - 0.005, R - 0.005, backH - 0.06, seg, 1, true, Math.PI - theta / 2 + 0.06, theta - 0.12]} />
          <meshPhysicalMaterial color={item.color} roughness={0.95} sheen={0.35} sheenRoughness={0.85} emissive={emissive} emissiveIntensity={ei} side={2} />
        </mesh>
      </group>
      {/* armrests */}
      {w >= 0.52 &&
        [-1, 1].map((sx) => (
          <group key={sx} position={[sx * w * 0.36, seatH, 0]}>
            <Box size={[0.03, 0.2, 0.03]} at={[0, 0.1, 0.02]}><Plastic color={dark} /></Box>
            <RBox size={[0.06, 0.025, 0.24]} at={[0, 0.21, 0]} radius={0.008}><Plastic color={dark} /></RBox>
          </group>
        ))}
    </>
  )
}

/** Dining / kids chair: four tapered legs, a seat with a cushion and a slatted back. */
function DiningChair({ item }: { item: Item }) {
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const seatH = Math.min(0.46, h * 0.5)
  const frame = item.color
  const cushion = isWoodTone(item.color) ? '#e8e2d8' : mix(item.color, '#ffffff', 0.3)
  const backH = h - seatH + 0.04
  const slats = 3
  return (
    <>
      <Legs w={w} d={d} h={seatH - 0.03} inset={0.035} r={0.019} taper={0.7}><Surface color={frame} /></Legs>
      <RBox size={[w * 0.94, 0.035, d * 0.92]} at={[0, seatH - 0.0175, 0]} radius={0.01}><Surface color={frame} /></RBox>
      <RBox size={[w * 0.82, 0.035, d * 0.76]} at={[0, seatH + 0.0175, 0.02]} radius={0.015}><Fabric color={cushion} /></RBox>
      <group position={[0, seatH - 0.04, -d / 2 + 0.03]} rotation={[-0.07, 0, 0]}>
        {[-1, 1].map((sx) => (
          <Box key={sx} size={[0.03, backH, 0.03]} at={[sx * (w * 0.44), backH / 2, 0]}><Surface color={frame} /></Box>
        ))}
        {Array.from({ length: slats }, (_, i) => (
          <Box key={i} size={[w * 0.88 - 0.03, i === slats - 1 ? 0.06 : 0.04, 0.02]} at={[0, backH * 0.35 + (i * (backH * 0.6)) / (slats - 1), 0]}>
            <Painted color={shade(frame, 1.0)} />
          </Box>
        ))}
      </group>
    </>
  )
}
