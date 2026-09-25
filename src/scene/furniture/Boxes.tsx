import { Instance, Instances } from '@react-three/drei'
import type { Item } from '../../types'
import { cm } from '../util'
import { boxVariant, shade } from './layout'
import { Bulb, Fabric, Lacquer, Metal, Painted, Plastic, Surface, useFx } from './materials'
import { Box, Cyl, RBox, Slats, useSeg } from './props'

/** Generic box item, with a few recognised silhouettes by name. */
export function BoxItem({ item }: { item: Item }) {
  switch (boxVariant(item.name)) {
    case 'piano': return <Piano item={item} />
    case 'lamp': return <FloorLamp item={item} />
    case 'chest': return <Chest item={item} />
    case 'beanbag': return <BeanBag item={item} />
    case 'treadmill': return <Treadmill item={item} />
    case 'radiatorCover': return <RadiatorCover item={item} />
    default: {
      const w = cm(item.w), d = cm(item.d), h = cm(item.h)
      return <RBox size={[w, h, d]} at={[0, h / 2, 0]} radius={0.02}><Surface color={item.color} /></RBox>
    }
  }
}

/** Upright piano: lacquered case, keybed with keys, fallboard, pedals. */
function Piano({ item }: { item: Item }) {
  const { emissive, ei } = useFx()
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const caseD = d * 0.55
  const keyY = Math.min(0.72, h * 0.58)
  const keyD = d - caseD
  const white = Math.max(20, Math.round((w - 0.16) / 0.0235))
  const keyW = (w - 0.16) / white
  const blackKeys = Array.from({ length: white }, (_, i) => i).filter((i) => [0, 1, 3, 4, 5].includes(i % 7))
  // the keybed and cheeks are a darker lacquer so the keys read against them
  const bed = shade(item.color, 0.78)
  const keysD = keyD - 0.03
  const keysZ = d / 2 - keyD / 2 + 0.015
  const keysBack = keysZ - keysD / 2
  return (
    <>
      <RBox size={[w, h, caseD]} at={[0, h / 2, -d / 2 + caseD / 2]} radius={0.012}><Lacquer color={item.color} /></RBox>
      {/* keybed shelf + cheeks */}
      <Box size={[w, 0.08, keyD]} at={[0, keyY - 0.04, d / 2 - keyD / 2]}><Lacquer color={bed} /></Box>
      {[-1, 1].map((sx) => (
        <Box key={sx} size={[0.06, 0.12, keyD]} at={[sx * (w / 2 - 0.03), keyY + 0.06, d / 2 - keyD / 2]}><Lacquer color={bed} /></Box>
      ))}
      {/* white keys: one bright slab with scored gaps, black keys instanced on top */}
      <Box size={[w - 0.12, 0.02, keysD]} at={[0, keyY + 0.01, keysZ]} receive={false}><Painted color="#fbfaf5" roughness={0.3} /></Box>
      <Instances limit={white - 1} receiveShadow={false}>
        <boxGeometry args={[0.0012, 0.004, keysD]} />
        <meshStandardMaterial color="#8d887c" roughness={0.6} emissive={emissive} emissiveIntensity={ei} />
        {Array.from({ length: white - 1 }, (_, i) => (
          <Instance key={i} position={[-(w - 0.16) / 2 + (i + 1) * keyW, keyY + 0.019, keysZ]} />
        ))}
      </Instances>
      <Instances limit={blackKeys.length} castShadow receiveShadow={false}>
        <boxGeometry args={[keyW * 0.55, 0.014, keysD * 0.6]} />
        <meshStandardMaterial color="#111111" roughness={0.4} emissive={emissive} emissiveIntensity={ei} />
        {blackKeys.map((i) => (
          <Instance key={i} position={[-(w - 0.16) / 2 + (i + 1) * keyW, keyY + 0.027, keysBack + (keysD * 0.6) / 2]} />
        ))}
      </Instances>
      {/* dark fallboard strip where the keys disappear under the case */}
      <Box size={[w - 0.12, 0.05, 0.002]} at={[0, keyY + 0.045, keysBack + 0.001]} cast={false} receive={false}><Painted color="#1c1714" roughness={0.6} /></Box>
      {/* fallboard lip + music stand */}
      <Box size={[w - 0.12, 0.05, 0.02]} at={[0, keyY + 0.14, -d / 2 + caseD + 0.01]}><Lacquer color={shade(item.color, 1.15)} /></Box>
      <Box size={[w * 0.45, 0.16, 0.01]} at={[0, keyY + 0.4, -d / 2 + caseD + 0.005]} rot={[-0.2, 0, 0]}><Lacquer color={shade(item.color, 1.15)} /></Box>
      {/* legs under the keybed + pedals */}
      {[-1, 1].map((sx) => (
        <Box key={sx} size={[0.06, keyY - 0.08, 0.06]} at={[sx * (w / 2 - 0.05), (keyY - 0.08) / 2, d / 2 - 0.05]}><Lacquer color={item.color} /></Box>
      ))}
      {[-0.08, 0, 0.08].map((x) => (
        <Box key={x} size={[0.03, 0.012, 0.09]} at={[x, 0.05, d / 2 - keyD - 0.02 + 0.06]} rot={[0.4, 0, 0]}><Metal color="#c9a85a" /></Box>
      ))}
    </>
  )
}

/** Floor lamp: weighted base, thin pole, drum shade that glows and lights the wall beside it in the evening. */
function FloorLamp({ item }: { item: Item }) {
  const w = cm(item.w), h = cm(item.h)
  const shadeH = Math.min(0.3, h * 0.22)
  const r = w / 2
  return (
    <>
      <Cyl r={Math.min(0.14, r * 0.9)} h={0.02} at={[0, 0.01, 0]} seg={28}><Metal color="#3a3d42" roughness={0.4} /></Cyl>
      <Cyl r={0.012} h={h - shadeH - 0.02} at={[0, 0.02 + (h - shadeH - 0.02) / 2, 0]} seg={10}><Metal color="#3a3d42" roughness={0.4} /></Cyl>
      <Cyl r={r} r2={r * 0.9} h={shadeH} at={[0, h - shadeH / 2, 0]} seg={32} open cast={false} receive={false}>
        <Fabric color={item.color} glow="#ffd9a0" />
      </Cyl>
      <Cyl r={r * 0.9} h={0.004} at={[0, h - 0.002, 0]} seg={32} cast={false}><Painted color={shade(item.color, 0.95)} /></Cyl>
      <Bulb at={[0, h - shadeH / 2, 0]} />
    </>
  )
}

/** Toy chest / trunk: rounded body, lid with a slight gap, front latch. */
function Chest({ item }: { item: Item }) {
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const lidH = Math.min(0.06, h * 0.14)
  return (
    <>
      <RBox size={[w - 0.02, h - lidH - 0.008, d - 0.02]} at={[0, (h - lidH - 0.008) / 2, 0]} radius={0.015}><Surface color={item.color} /></RBox>
      <RBox size={[w, lidH, d]} at={[0, h - lidH / 2, 0]} radius={Math.min(0.02, lidH / 2 - 0.002)}><Surface color={shade(item.color, 0.95)} /></RBox>
      <Box size={[0.05, 0.04, 0.012]} at={[0, h - lidH - 0.03, d / 2 - 0.004]}><Metal color="#c9a85a" /></Box>
    </>
  )
}

/** Bean bag: squashed sphere in fabric. */
function BeanBag({ item }: { item: Item }) {
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const seg = useSeg(28)
  return (
    <mesh position={[0, h * 0.5, 0]} scale={[w / 2, h * 0.5, d / 2]} castShadow receiveShadow>
      <sphereGeometry args={[1, seg, Math.round(seg * 0.7)]} />
      <Fabric color={item.color} />
    </mesh>
  )
}

/** Treadmill: deck, side rails, console mast with a display. */
function Treadmill({ item }: { item: Item }) {
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const beltW = w * 0.62
  return (
    <>
      <Box size={[w, 0.05, d * 0.45]} at={[0, 0.025, d / 2 - d * 0.225 - 0.02]}><Plastic color="#3a3d42" /></Box>
      <RBox size={[w * 0.8, 0.12, d * 0.72]} at={[0, 0.06, d * 0.1]} radius={0.02}><Plastic color={shade(item.color, 0.85)} /></RBox>
      <Box size={[beltW, 0.006, d * 0.68]} at={[0, 0.123, d * 0.1]}><Plastic color="#26282c" roughness={0.9} /></Box>
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Cyl r={0.02} h={h - 0.35} at={[sx * (w / 2 - 0.05), 0.12 + (h - 0.35) / 2, -d / 2 + 0.12]} rot={[0.25, 0, 0]} seg={10}><Metal color="#b9bec4" /></Cyl>
          <Cyl r={0.02} h={d * 0.45} at={[sx * (w / 2 - 0.05), h - 0.32, -d / 2 + 0.28]} rot={[Math.PI / 2, 0, 0]} seg={10}><Metal color="#b9bec4" /></Cyl>
        </group>
      ))}
      <RBox size={[w * 0.7, 0.2, 0.06]} at={[0, h - 0.1, -d / 2 + 0.06]} rot={[-0.3, 0, 0]} radius={0.015}><Plastic color={item.color} /></RBox>
      <Box size={[w * 0.4, 0.09, 0.005]} at={[0, h - 0.1, -d / 2 + 0.06 + 0.032]} rot={[-0.3, 0, 0]}><Plastic color="#1d1f22" roughness={0.2} /></Box>
    </>
  )
}

/** Radiator cover: painted frame with a slatted front and a shelf top. */
function RadiatorCover({ item }: { item: Item }) {
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const t = 0.03
  return (
    <>
      <RBox size={[w, t, d]} at={[0, h - t / 2, 0]} radius={0.006}><Surface color={item.color} /></RBox>
      {[-1, 1].map((sx) => (
        <Box key={sx} size={[0.06, h - t, d]} at={[sx * (w / 2 - 0.03), (h - t) / 2, 0]}><Surface color={item.color} /></Box>
      ))}
      <Box size={[w - 0.12, 0.06, d]} at={[0, 0.03, 0]}><Surface color={item.color} /></Box>
      <Box size={[w - 0.12, h - t - 0.06, 0.01]} at={[0, 0.06 + (h - t - 0.06) / 2, -d / 2 + 0.03]} cast={false}><Painted color="#5c5852" roughness={0.9} /></Box>
      <Slats length={w - 0.14} height={h - t - 0.08} at={[0, 0.06 + (h - t - 0.06) / 2, d / 2 - 0.012]} pitch={0.05} w={0.022} d={0.012} color={item.color} />
    </>
  )
}
