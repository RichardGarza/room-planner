import { Instance, Instances, RoundedBox } from '@react-three/drei'
import type { ReactNode } from 'react'
import type { Book } from './layout'
import { Fabric, Metal, Painted, Plastic, useFx } from './materials'

/* ----------------------------- shared primitives ---------------------------- */

export type V3 = [number, number, number]

type Shadow = { cast?: boolean; receive?: boolean }
type Placed = { at?: V3; rot?: V3 } & Shadow

/** Plain box; solid pieces cast and receive shadows by default. */
export function Box({ size, at, rot, cast = true, receive = true, children }: Placed & { size: V3; children: ReactNode }) {
  return (
    <mesh position={at} rotation={rot} castShadow={cast} receiveShadow={receive}>
      <boxGeometry args={size} />
      {children}
    </mesh>
  )
}

/** Box with softened edges; the radius is clamped so tiny pieces stay valid. */
export function RBox({ size, at, rot, radius = 0.02, cast = true, receive = true, children }: Placed & { size: V3; radius?: number; children: ReactNode }) {
  const { fast } = useFx()
  const r = Math.max(0.001, Math.min(radius, Math.min(size[0], size[1], size[2]) / 2 - 0.001))
  return (
    <RoundedBox args={size} radius={r} smoothness={fast ? 1 : 3} position={at} rotation={rot} castShadow={cast} receiveShadow={receive}>
      {children}
    </RoundedBox>
  )
}

/** Fewer segments on the fast quality setting. */
export function useSeg(n: number) {
  const { fast } = useFx()
  return fast ? Math.max(6, Math.round(n / 2)) : n
}

/** Cylinder or cone (r = bottom radius, r2 = top radius, default equal). */
export function Cyl({ r, r2, h, at, rot, seg = 24, open = false, theta, cast = true, receive = true, children }: Placed & { r: number; r2?: number; h: number; seg?: number; open?: boolean; theta?: [number, number]; children: ReactNode }) {
  const s = useSeg(seg)
  return (
    <mesh position={at} rotation={rot} castShadow={cast} receiveShadow={receive}>
      <cylinderGeometry args={[r2 ?? r, r, h, s, 1, open, theta?.[0] ?? 0, theta?.[1] ?? Math.PI * 2]} />
      {children}
    </mesh>
  )
}

/** Four tapered legs under a w × d footprint, `h` tall starting at `y`. */
export function Legs({ w, d, h, y = 0, inset = 0.05, r = 0.02, taper = 0.7, square = false, children }: { w: number; d: number; h: number; y?: number; inset?: number; r?: number; taper?: number; square?: boolean; children: ReactNode }) {
  const xs = [-1, 1], zs = [-1, 1]
  return (
    <>
      {xs.map((sx) =>
        zs.map((sz) => {
          const at: V3 = [sx * (w / 2 - inset), y + h / 2, sz * (d / 2 - inset)]
          return square ? (
            <Box key={`${sx}${sz}`} size={[r * 2, h, r * 2]} at={at}>{children}</Box>
          ) : (
            <Cyl key={`${sx}${sz}`} r={r} r2={r * taper} h={h} at={at} seg={12}>{children}</Cyl>
          )
        }),
      )}
    </>
  )
}

/** Horizontal (or vertical when `vertical`) metal bar handle. */
export function Bar({ length, at, vertical = false, r = 0.006 }: { length: number; at: V3; vertical?: boolean; r?: number }) {
  return (
    <group position={at}>
      <Cyl r={r} h={length} rot={vertical ? [0, 0, 0] : [0, 0, Math.PI / 2]} seg={10} receive={false}><Metal /></Cyl>
      <Box size={vertical ? [r * 2, length * 0.9, 0.012] : [length * 0.9, r * 2, 0.012]} at={[0, 0, -0.008]} receive={false}><Metal color="#b9bec4" /></Box>
    </group>
  )
}

/** Small round knob. */
export function Knob({ at, r = 0.013 }: { at: V3; r?: number }) {
  const s = useSeg(12)
  return (
    <mesh position={at} castShadow>
      <sphereGeometry args={[r, s, s]} />
      <Metal color="#d8d5cf" roughness={0.35} />
    </mesh>
  )
}

/* ---------------------------------- books ---------------------------------- */

/** One instanced batch for every book of a piece; each row lists its origin (left edge, shelf top, centre z). */
export function Books({ rows, depth }: { rows: { at: V3; books: Book[] }[]; depth: number }) {
  const { emissive, ei } = useFx()
  const count = rows.reduce((n, r) => n + r.books.length, 0)
  if (count === 0) return null
  return (
    <Instances key={count} limit={count} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.7} emissive={emissive} emissiveIntensity={ei} />
      {rows.map((row, ri) =>
        row.books.map((b, i) => (
          <Instance
            key={`${ri}-${i}`}
            color={b.color}
            position={[row.at[0] + b.x + b.w / 2 + (b.lean ? b.h * Math.sin(b.lean) * 0.5 : 0), row.at[1] + b.h / 2, row.at[2]]}
            rotation={[0, 0, -b.lean]}
            scale={[b.w, b.h, depth]}
          />
        )),
      )}
    </Instances>
  )
}

/** Vertical slats between two points along x (for crib rails, radiator covers). */
export function Slats({ length, height, at, pitch = 0.08, w = 0.018, d = 0.018, color = '#f4f1ec', rot }: { length: number; height: number; at: V3; pitch?: number; w?: number; d?: number; color?: string; rot?: V3 }) {
  const { emissive, ei } = useFx()
  const n = Math.max(1, Math.floor(length / pitch))
  const step = length / n
  return (
    <group position={at} rotation={rot}>
      <Instances key={n} limit={n} castShadow receiveShadow>
        <boxGeometry args={[w, height, d]} />
        <meshStandardMaterial color={color} roughness={0.55} emissive={emissive} emissiveIntensity={ei} />
        {Array.from({ length: n }, (_, i) => (
          <Instance key={i} position={[-length / 2 + (i + 0.5) * step, 0, 0]} />
        ))}
      </Instances>
    </group>
  )
}

/* ---------------------------------- props ---------------------------------- */

/** Closed laptop lying on a desk. */
export function Laptop({ at, yaw = 0.12 }: { at: V3; yaw?: number }) {
  return (
    <group position={at} rotation={[0, yaw, 0]}>
      <RBox size={[0.31, 0.012, 0.215]} at={[0, 0.006, 0]} radius={0.004}><Plastic color="#9a9ea3" roughness={0.35} /></RBox>
      <RBox size={[0.31, 0.007, 0.215]} at={[0, 0.0155, 0]} radius={0.003}><Plastic color="#6b6f75" roughness={0.3} /></RBox>
    </group>
  )
}

/** Small desk lamp: weighted base, tilted stem, conical shade with a warm glow. */
export function DeskLamp({ at, h = 0.42, color = '#f1e6d2' }: { at: V3; h?: number; color?: string }) {
  const stem = h - 0.14
  return (
    <group position={at}>
      <Cyl r={0.07} h={0.014} at={[0, 0.007, 0]}><Metal color="#3a3d42" roughness={0.4} /></Cyl>
      <Cyl r={0.007} h={stem} at={[0.03, 0.014 + stem / 2, 0]} rot={[0, 0, -0.18]} seg={8}><Metal color="#3a3d42" roughness={0.4} /></Cyl>
      <Cyl r={0.09} r2={0.035} h={0.12} at={[0.09, h - 0.06, 0]} rot={[0, 0, -0.35]} open>
        <Fabric color={color} glow="#ffd9a0" />
      </Cyl>
    </group>
  )
}

/** Potted plant for shelves. */
export function Plant({ at, size = 0.14 }: { at: V3; size?: number }) {
  const s = useSeg(14)
  return (
    <group position={at}>
      <Cyl r={size * 0.28} r2={size * 0.34} h={size * 0.5} at={[0, size * 0.25, 0]} seg={14}><Painted color="#d8c3a5" roughness={0.8} /></Cyl>
      <mesh position={[0, size * 0.75, 0]} castShadow>
        <sphereGeometry args={[size * 0.38, s, s]} />
        <Painted color="#6f9a5e" roughness={0.9} />
      </mesh>
      <mesh position={[size * 0.2, size * 0.95, size * 0.08]} castShadow>
        <sphereGeometry args={[size * 0.24, s, s]} />
        <Painted color="#7fae6b" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** Small closed box / basket for a shelf. */
export function SmallBox({ at, size, color }: { at: V3; size: V3; color: string }) {
  return (
    <RBox size={size} at={at} radius={0.008}><Fabric color={color} sheen={0.2} /></RBox>
  )
}
