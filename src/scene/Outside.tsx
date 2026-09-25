import * as THREE from 'three'
import { useMemo } from 'react'
import type { Opening } from '../types'
import { cloudTexture, glowTexture, skyTexture } from './textures'
import { cm, mergedBoxes, seeded, useDisposable, WALL_T, type BoxSpec } from './util'

/* ------------------------------------------------------------------------ */
/*  The world beyond a wall's windows, in that wall's local frame            */
/*  (x along the wall, y up, -z is outdoors).                                */
/*                                                                          */
/*  It is only ever seen through the glass: a mask plane in each window     */
/*  opening writes 1 into the stencil buffer and everything outdoors is     */
/*  drawn with a stencil test for that value, so nothing leaks over the     */
/*  walls in the outside views. Nothing out here casts or receives shadows. */
/*  The hallway behind a door uses the same trick with its own value.       */
/* ------------------------------------------------------------------------ */

export const MASK_ORDER = -20, WORLD_ORDER = -10
export const WINDOW_STENCIL = 1, HALL_STENCIL = 2

/** Material properties that draw only where a mask has written `ref` (and never touch the stencil). */
export const stencilTest = (ref: number) => ({
  stencilWrite: true,
  stencilWriteMask: 0,
  stencilRef: ref,
  stencilFunc: THREE.EqualStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.KeepStencilOp,
} as const)

const stencilProps = stencilTest(WINDOW_STENCIL)

/** An invisible plane in an opening that stamps `stencil` wherever it lands on screen. */
export function MaskPlane({ x, y, w, h, stencil }: { x: number; y: number; w: number; h: number; stencil: number }) {
  return (
    <mesh position={[x, y, -WALL_T + 0.002]} renderOrder={MASK_ORDER}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        colorWrite={false}
        depthWrite={false}
        stencilWrite
        stencilRef={stencil}
        stencilFunc={THREE.AlwaysStencilFunc}
        stencilZPass={THREE.ReplaceStencilOp}
        stencilFail={THREE.ReplaceStencilOp}
        stencilZFail={THREE.ReplaceStencilOp}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function WindowMask({ win }: { win: Opening }) {
  const x0 = cm(win.offset), ww = cm(win.width), s = cm(win.sill), hh = cm(win.height)
  return <MaskPlane x={x0 + ww / 2} y={s + hh / 2} w={ww} h={hh} stencil={WINDOW_STENCIL} />
}

export function Outside({ windows, wallLength, daytime, detail }: { windows: Opening[]; wallLength: number; daytime: boolean; detail: 'best' | 'fast' }) {
  const sky = skyTexture(daytime)
  const glow = glowTexture()
  const cloud = cloudTexture()
  const L = wallLength
  const midX = L / 2
  const std = (color: string, extra?: Partial<THREE.MeshStandardMaterialParameters>) => (
    <meshStandardMaterial color={color} roughness={1} {...stencilProps} {...extra} />
  )

  // A row of trees, close enough that their canopies sit in the panes at eye height, and a few shrubs
  // by the fence; seeded from the wall length so a room keeps its garden.
  const { trees, shrubs } = useMemo(() => {
    const rnd = seeded(Math.round(L * 100) + 5)
    const trees: { x: number; z: number; h: number; r: number; tone: number; lean: number }[] = []
    // one near tree either side of the window's line of sight (so the sky and the moon stay visible
    // between them), and sometimes a small tree further off in the middle
    for (const side of [-1, 1]) {
      trees.push({
        x: midX + side * (2.0 + rnd() * 1.2),
        z: -5.6 - rnd() * 1.6,
        h: 2.4 + rnd() * 0.9, // trunk height: canopies centre around 2.4–3.3 m
        r: 1.05 + rnd() * 0.45,
        tone: rnd(),
        lean: (rnd() - 0.5) * 0.12,
      })
    }
    if (rnd() > 0.4) trees.push({ x: midX + (rnd() - 0.5) * 1.6, z: -11 - rnd() * 2, h: 1.5 + rnd() * 0.4, r: 0.8 + rnd() * 0.2, tone: rnd(), lean: 0 })
    const shrubs: { x: number; z: number; r: number; tone: number }[] = []
    const m = 4 + Math.round(rnd() * 2)
    for (let i = 0; i < m; i++) shrubs.push({ x: midX + (rnd() - 0.5) * (L + 6), z: -3.6 - rnd() * 0.8, r: 0.32 + rnd() * 0.28, tone: rnd() })
    return { trees, shrubs }
  }, [L, midX])

  // a picket fence along the garden (one merged geometry), replacing the old hedge slab
  const fence = useDisposable(useMemo(() => {
    const boxes: BoxSpec[] = []
    const len = L + 10
    const gap = 0.16
    const n = Math.floor(len / gap)
    for (let i = 0; i <= n; i++) boxes.push([midX - len / 2 + i * gap, 0.5, -4.6, 0.08, 1.0, 0.02])
    boxes.push([midX, 0.32, -4.61, len, 0.06, 0.02])
    boxes.push([midX, 0.78, -4.61, len, 0.06, 0.02])
    return mergedBoxes(boxes)
  }, [L, midX]))

  // far tree line + house silhouettes as one merged geometry
  const distant = useDisposable(useMemo(() => {
    const boxes: BoxSpec[] = []
    const rnd = seeded(77)
    // low enough that the sky (and the moon) shows above them from the far side of the room
    for (let i = -6; i <= 6; i++) {
      const h = 1.8 + rnd() * 1.4
      boxes.push([midX + i * 2.6 + (rnd() - 0.5) * 1.2, h / 2 - 0.3, -19 - rnd() * 3, 2.8 + rnd() * 1.4, h, 1.6])
    }
    return mergedBoxes(boxes)
  }, [midX]))

  const stars = useMemo(() => {
    const rnd = seeded(3)
    const pts = new Float32Array(110 * 3)
    for (let i = 0; i < 110; i++) {
      const a = (rnd() - 0.5) * Math.PI * 1.4, e = 0.15 + rnd() * 1.2
      pts[i * 3] = midX + Math.sin(a) * Math.cos(e) * 26
      pts[i * 3 + 1] = Math.sin(e) * 26
      pts[i * 3 + 2] = -Math.cos(a) * Math.cos(e) * 26
    }
    return pts
  }, [midX])

  // lit windows on the neighbour's house and the distant street at night
  const litWindows = useMemo(() => {
    const rnd = seeded(21)
    const out: [number, number, number, number, number][] = [[midX - 6.5 + 1.4, 1.5, -11 + 2.51, 0.9, 1.1], [midX - 6.5 - 1.6, 1.7, -11 + 2.51, 0.7, 0.9]]
    for (let i = 0; i < 9; i++) out.push([midX + (rnd() - 0.5) * 26, 0.9 + rnd() * 2.2, -18.6, 0.8 + rnd() * 0.5, 0.9 + rnd() * 0.6])
    return out
  }, [midX])

  const green = daytime ? '#6f9d55' : '#0f1a12'
  const lawn = daytime ? '#8dbb6c' : '#101c13'
  const trunk = daytime ? '#6b4b32' : '#1a120c'
  const far = daytime ? '#8ea6bf' : '#141a2c'
  const house = daytime ? '#c9bfb2' : '#1a1a24'
  const roof = daytime ? '#7d5b4c' : '#151119'
  const picket = daytime ? '#e9e3d6' : '#1c1a18'
  const canopySeg: [number, number] = detail === 'best' ? [14, 10] : [8, 6]

  return (
    <group>
      <group renderOrder={MASK_ORDER}>
        {windows.map((w) => <WindowMask key={w.id} win={w} />)}
      </group>
      <group renderOrder={WORLD_ORDER}>
        {/* sky dome around the wall (seen from inside through the glass) */}
        <mesh position={[midX, 0, -2]} renderOrder={WORLD_ORDER}>
          <sphereGeometry args={[28, 24, 16]} />
          <meshBasicMaterial map={sky} side={THREE.BackSide} {...stencilProps} fog={false} />
        </mesh>
        {/* sun or moon */}
        {daytime ? (
          <>
            <mesh position={[midX + 7, 12, -21]} renderOrder={WORLD_ORDER}>
              <circleGeometry args={[1.2, 24]} />
              <meshBasicMaterial color="#fff6d5" {...stencilProps} />
            </mesh>
            {/* a couple of soft clouds, low enough to show above the skyline from across the room */}
            {[[midX - 6, 5.4, -24, 9, 2.6, 0.8], [midX + 4, 4.7, -26, 8, 2.2, 0.6], [midX + 11, 6.5, -23, 6, 2.0, 0.5]].map(([x, y, z, w, h, o], i) => (
              <mesh key={i} position={[x, y, z]} renderOrder={WORLD_ORDER + 1}>
                <planeGeometry args={[w, h]} />
                <meshBasicMaterial map={cloud} transparent opacity={o} depthWrite={false} {...stencilProps} />
              </mesh>
            ))}
          </>
        ) : (
          /* the moon sits low enough to show over the tree line from inside the room */
          <group position={[midX + 0.8, 4.0, -27]}>
            <mesh renderOrder={WORLD_ORDER}>
              <circleGeometry args={[1.6, 32]} />
              <meshBasicMaterial color="#fff7dc" {...stencilProps} />
            </mesh>
            <mesh position={[0, 0, -0.05]} renderOrder={WORLD_ORDER}>
              <planeGeometry args={[24, 24]} />
              <meshBasicMaterial map={glow} color="#a9b3dc" transparent opacity={0.4} depthWrite={false} {...stencilProps} />
            </mesh>
            <points renderOrder={WORLD_ORDER}>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[stars, 3]} />
              </bufferGeometry>
              <pointsMaterial color="#e8eeff" size={0.16} sizeAttenuation {...stencilProps} />
            </points>
          </group>
        )}
        {/* lawn right up to the house, a path, a picket fence, shrubs, trees and a distant street */}
        <mesh position={[midX, -0.05, -30]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={WORLD_ORDER}>
          <planeGeometry args={[L + 70, 60]} />
          {std(lawn)}
        </mesh>
        <mesh position={[midX, -0.02, -0.9]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={WORLD_ORDER}>
          <planeGeometry args={[L + 4, 1.4]} />
          {std(daytime ? '#a99f8f' : '#171512')}
        </mesh>
        <mesh geometry={fence} renderOrder={WORLD_ORDER}>
          {std(picket, { roughness: 0.9 })}
        </mesh>
        {shrubs.map((s, i) => (
          <mesh key={i} position={[s.x, s.r * 0.8, s.z]} scale={[1.25, 1, 1]} renderOrder={WORLD_ORDER}>
            <sphereGeometry args={[s.r, 10, 7]} />
            {std(s.tone > 0.5 ? (daytime ? '#5f8f49' : '#0c150e') : (daytime ? '#7aa65a' : '#0f1a11'))}
          </mesh>
        ))}
        {trees.map((t, i) => (
          <group key={i} position={[t.x, 0, t.z]} rotation={[0, 0, t.lean]}>
            <mesh position={[0, t.h * 0.45, 0]} renderOrder={WORLD_ORDER}>
              <cylinderGeometry args={[0.09, 0.16, t.h * 0.9, 10]} />
              {std(trunk)}
            </mesh>
            {/* a couple of branch stubs where the trunk meets the canopy */}
            <mesh position={[0.22, t.h * 0.78, 0.05]} rotation={[0, 0, -0.9]} renderOrder={WORLD_ORDER}>
              <cylinderGeometry args={[0.04, 0.07, 0.7, 6]} />
              {std(trunk)}
            </mesh>
            <mesh position={[-0.2, t.h * 0.82, -0.08]} rotation={[0.2, 0, 0.8]} renderOrder={WORLD_ORDER}>
              <cylinderGeometry args={[0.04, 0.06, 0.6, 6]} />
              {std(trunk)}
            </mesh>
            <mesh position={[0, t.h, 0]} renderOrder={WORLD_ORDER}>
              <sphereGeometry args={[t.r, ...canopySeg]} />
              {std(t.tone > 0.5 ? green : daytime ? '#7fae62' : '#111e14')}
            </mesh>
            <mesh position={[t.r * 0.55, t.h - t.r * 0.2, 0.3]} renderOrder={WORLD_ORDER}>
              <sphereGeometry args={[t.r * 0.66, 10, 8]} />
              {std(daytime ? '#8bb86d' : '#132217')}
            </mesh>
            <mesh position={[-t.r * 0.5, t.h + t.r * 0.25, -0.2]} renderOrder={WORLD_ORDER}>
              <sphereGeometry args={[t.r * 0.58, 10, 8]} />
              {std(daytime ? '#6a9a52' : '#0e1911')}
            </mesh>
          </group>
        ))}
        {/* a neighbour's house */}
        <group position={[midX - 6.5, 0, -11]}>
          <mesh position={[0, 1.6, 0]} renderOrder={WORLD_ORDER}>
            <boxGeometry args={[6, 3.2, 5]} />
            {std(house)}
          </mesh>
          <mesh position={[0, 3.2 + 1.1, 0]} rotation={[0, Math.PI / 4, 0]} renderOrder={WORLD_ORDER}>
            <coneGeometry args={[4.6, 2.2, 4]} />
            {std(roof)}
          </mesh>
        </group>
        {!daytime && litWindows.map(([x, y, z, w, h], i) => (
          <mesh key={i} position={[x, y, z]} renderOrder={WORLD_ORDER + 1}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial color={i % 3 === 0 ? '#ffd89a' : '#f6e3b8'} {...stencilProps} />
          </mesh>
        ))}
        <mesh geometry={distant} renderOrder={WORLD_ORDER}>
          {std(far)}
        </mesh>
      </group>
    </group>
  )
}
