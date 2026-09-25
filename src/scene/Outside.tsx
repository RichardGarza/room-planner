import * as THREE from 'three'
import { useMemo } from 'react'
import type { Opening } from '../types'
import { glowTexture, skyTexture } from './textures'
import { cm, mergedBoxes, seeded, WALL_T } from './util'

/* ------------------------------------------------------------------------ */
/*  The world beyond a wall's windows, in that wall's local frame            */
/*  (x along the wall, y up, -z is outdoors).                                */
/*                                                                          */
/*  It is only ever seen through the glass: a mask plane in each window     */
/*  opening writes 1 into the stencil buffer and everything outdoors is     */
/*  drawn with a stencil test for that value, so nothing leaks over the     */
/*  walls in the outside views. Nothing out here casts or receives shadows. */
/* ------------------------------------------------------------------------ */

const MASK_ORDER = -20, WORLD_ORDER = -10

const stencilProps = {
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.EqualStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.KeepStencilOp,
} as const

function WindowMask({ win }: { win: Opening }) {
  const x0 = cm(win.offset), ww = cm(win.width), s = cm(win.sill), hh = cm(win.height)
  return (
    <mesh position={[x0 + ww / 2, s + hh / 2, -WALL_T + 0.002]} renderOrder={MASK_ORDER}>
      <planeGeometry args={[ww, hh]} />
      <meshBasicMaterial
        colorWrite={false}
        depthWrite={false}
        stencilWrite
        stencilRef={1}
        stencilFunc={THREE.AlwaysStencilFunc}
        stencilZPass={THREE.ReplaceStencilOp}
        stencilFail={THREE.ReplaceStencilOp}
        stencilZFail={THREE.ReplaceStencilOp}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export function Outside({ windows, wallLength, daytime, detail }: { windows: Opening[]; wallLength: number; daytime: boolean; detail: 'best' | 'fast' }) {
  const sky = skyTexture(daytime)
  const glow = glowTexture()
  const L = wallLength
  const midX = L / 2
  const std = (color: string, extra?: Partial<THREE.MeshStandardMaterialParameters>) => (
    <meshStandardMaterial color={color} roughness={1} {...stencilProps} {...extra} />
  )

  // A row of trees and a hedge line, seeded from the wall length so a room keeps its garden.
  const trees = useMemo(() => {
    const rnd = seeded(Math.round(L * 100) + 5)
    const out: { x: number; z: number; h: number; r: number; tone: number }[] = []
    const n = 2 + Math.round(rnd())
    for (let i = 0; i < n; i++) {
      out.push({ x: midX + (i - (n - 1) / 2) * (1.8 + rnd() * 1.6) + (rnd() - 0.5) * 0.8, z: -6.4 - rnd() * 2, h: 3 + rnd() * 1.4, r: 0.9 + rnd() * 0.5, tone: rnd() })
    }
    return out
  }, [L, midX])

  // far tree line + house silhouettes as one merged geometry
  const distant = useMemo(() => {
    const boxes = [] as [number, number, number, number, number, number][]
    const rnd = seeded(77)
    for (let i = -6; i <= 6; i++) {
      const h = 2.4 + rnd() * 2.2
      boxes.push([midX + i * 2.6 + (rnd() - 0.5) * 1.2, h / 2 - 0.3, -19 - rnd() * 3, 2.2 + rnd() * 1.4, h, 1.6])
    }
    return mergedBoxes(boxes)
  }, [midX])

  const stars = useMemo(() => {
    const rnd = seeded(3)
    const pts = new Float32Array(90 * 3)
    for (let i = 0; i < 90; i++) {
      const a = (rnd() - 0.5) * Math.PI * 1.4, e = 0.15 + rnd() * 1.2
      pts[i * 3] = midX + Math.sin(a) * Math.cos(e) * 26
      pts[i * 3 + 1] = Math.sin(e) * 26
      pts[i * 3 + 2] = -Math.cos(a) * Math.cos(e) * 26
    }
    return pts
  }, [midX])

  const green = daytime ? '#6f9d55' : '#0f1a12'
  const lawn = daytime ? '#8dbb6c' : '#101c13'
  const hedge = daytime ? '#587f43' : '#0c150e'
  const trunk = daytime ? '#6b4b32' : '#1a120c'
  const far = daytime ? '#8ea6bf' : '#141a2c'
  const house = daytime ? '#c9bfb2' : '#1a1a24'
  const roof = daytime ? '#7d5b4c' : '#151119'

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
          <mesh position={[midX + 7, 12, -21]} renderOrder={WORLD_ORDER}>
            <circleGeometry args={[1.2, 24]} />
            <meshBasicMaterial color="#fff6d5" {...stencilProps} />
          </mesh>
        ) : (
          <group position={[midX - 5, 9, -20]}>
            <mesh renderOrder={WORLD_ORDER}>
              <circleGeometry args={[0.8, 28]} />
              <meshBasicMaterial color="#fff7dc" {...stencilProps} />
            </mesh>
            <mesh position={[0, 0, -0.05]} renderOrder={WORLD_ORDER}>
              <planeGeometry args={[6, 6]} />
              <meshBasicMaterial map={glow} color="#8fa2e6" transparent opacity={0.35} depthWrite={false} {...stencilProps} />
            </mesh>
            <points renderOrder={WORLD_ORDER}>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[stars, 3]} />
              </bufferGeometry>
              <pointsMaterial color="#e8eeff" size={0.09} sizeAttenuation {...stencilProps} />
            </points>
          </group>
        )}
        {/* lawn right up to the house, a low hedge, trees and a distant street */}
        <mesh position={[midX, -0.05, -30]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={WORLD_ORDER}>
          <planeGeometry args={[L + 70, 60]} />
          {std(lawn)}
        </mesh>
        <mesh position={[midX, -0.02, -0.9]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={WORLD_ORDER}>
          <planeGeometry args={[L + 4, 1.4]} />
          {std(daytime ? '#a99f8f' : '#171512')}
        </mesh>
        <mesh position={[midX, 0.36, -5.2]} renderOrder={WORLD_ORDER}>
          <boxGeometry args={[L + 10, 0.72, 0.6]} />
          {std(hedge)}
        </mesh>
        {trees.map((t, i) => (
          <group key={i} position={[t.x, 0, t.z]}>
            <mesh position={[0, t.h * 0.35, 0]} renderOrder={WORLD_ORDER}>
              <cylinderGeometry args={[0.07, 0.12, t.h * 0.7, 7]} />
              {std(trunk)}
            </mesh>
            <mesh position={[0, t.h * 0.78, 0]} renderOrder={WORLD_ORDER}>
              <sphereGeometry args={[t.r, detail === 'best' ? 14 : 8, detail === 'best' ? 10 : 6]} />
              {std(t.tone > 0.5 ? green : daytime ? '#7fae62' : '#111e14')}
            </mesh>
            <mesh position={[t.r * 0.5, t.h * 0.62, 0.25]} renderOrder={WORLD_ORDER}>
              <sphereGeometry args={[t.r * 0.62, 10, 8]} />
              {std(daytime ? '#8bb86d' : '#132217')}
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
          {!daytime && (
            <mesh position={[1.4, 1.5, 2.51]} renderOrder={WORLD_ORDER}>
              <planeGeometry args={[0.9, 1.1]} />
              <meshBasicMaterial color="#ffd89a" {...stencilProps} />
            </mesh>
          )}
        </group>
        <mesh geometry={distant} renderOrder={WORLD_ORDER}>
          {std(far)}
        </mesh>
      </group>
    </group>
  )
}
