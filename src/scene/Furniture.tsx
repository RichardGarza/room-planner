import * as THREE from 'three'
import { type ThreeEvent } from '@react-three/fiber'
import { useState } from 'react'
import { useStore } from '../store'
import type { Item } from '../types'
import { cm, shadeColor } from './util'

/* -------------------------------- furniture ------------------------------- */

export function Furniture({ item, onStartDrag }: { item: Item; onStartDrag?: () => void }) {
  const selected = useStore((s) => s.selectedId === item.id)
  const bedding = useStore((s) => s.bedding)
  const select = useStore((s) => s.select)
  const snapshot = useStore((s) => s.snapshot)
  const [hover, setHover] = useState(false)

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    select(item.id)
    if (onStartDrag) { snapshot(); onStartDrag() }
  }
  const emissive = selected ? '#ff7a3d' : hover ? '#ffb27a' : '#000000'
  const ei = selected ? 0.22 : hover ? 0.12 : 0
  const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => (
    <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={ei} roughness={0.8} {...extra} />
  )
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)

  let body: React.ReactNode
  switch (item.kind) {
    case 'bed':
      body = (
        <>
          <mesh position={[0, 0.18, 0]} castShadow receiveShadow><boxGeometry args={[w, 0.36, d]} />{mat('#f4f1ec')}</mesh>
          <mesh position={[0, 0.46, 0.03]} castShadow receiveShadow><boxGeometry args={[w - 0.12, 0.2, d - 0.16]} />{mat('#fbfaf8')}</mesh>
          <mesh position={[0, h / 2, -d / 2 + 0.04]} castShadow receiveShadow><boxGeometry args={[w, h, 0.08]} />{mat('#ece7e0')}</mesh>
          {bedding && (
            <>
              <mesh position={[0, 0.6, d * 0.12]} castShadow receiveShadow><boxGeometry args={[w - 0.16, 0.09, d * 0.62]} />{mat(item.color, { roughness: 1 })}</mesh>
              <mesh position={[-w / 4 + 0.03, 0.6, -d / 2 + 0.32]} castShadow><boxGeometry args={[w / 2 - 0.16, 0.1, 0.4]} />{mat('#ffffff', { roughness: 1 })}</mesh>
              <mesh position={[w / 4 - 0.03, 0.6, -d / 2 + 0.32]} castShadow><boxGeometry args={[w / 2 - 0.16, 0.1, 0.4]} />{mat('#ffffff', { roughness: 1 })}</mesh>
            </>
          )}
        </>
      )
      break
    case 'chair':
      body = (
        <>
          <mesh position={[0, 0.02, 0]} castShadow><cylinderGeometry args={[w / 2.2, w / 2.2, 0.04, 20]} />{mat('#d8d8d8')}</mesh>
          <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.02, 0.02, 0.42, 8]} />{mat('#b8b8b8')}</mesh>
          <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[w * 0.8, 0.06, d * 0.8]} />{mat(item.color)}</mesh>
          <mesh position={[0, 0.5 + (h - 0.5) / 2, -d * 0.36]} castShadow><boxGeometry args={[w * 0.75, h - 0.5, 0.06]} />{mat(item.color)}</mesh>
        </>
      )
      break
    case 'desk':
      body = (
        <>
          <mesh position={[0, h - 0.015, 0]} castShadow receiveShadow><boxGeometry args={[w, 0.03, d]} />{mat(item.color)}</mesh>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} position={[sx * (w / 2 - 0.03), (h - 0.03) / 2, sz * (d / 2 - 0.03)]} castShadow>
              <boxGeometry args={[0.04, h - 0.03, 0.04]} />
              {mat('#e7e2da')}
            </mesh>
          ))}
        </>
      )
      break
    case 'rug':
      body = (
        <mesh position={[0, 0.006, 0]} receiveShadow>
          <cylinderGeometry args={[w / 2, w / 2, 0.012, 40]} />
          {mat(item.color, { roughness: 1 })}
        </mesh>
      )
      break
    case 'bookcase':
    case 'shelf': {
      const shelves = Math.max(2, Math.round(item.h / 32))
      body = (
        <>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} />{mat(item.color)}</mesh>
          {Array.from({ length: shelves }, (_, i) => (
            <mesh key={i} position={[0, ((i + 0.5) * h) / shelves, d / 2 + 0.002]}>
              <boxGeometry args={[w - 0.05, h / shelves - 0.05, 0.004]} />
              {mat(i % 2 ? '#d9e6f2' : '#f2d9e4', { roughness: 1 })}
            </mesh>
          ))}
        </>
      )
      break
    }
    case 'dresser':
      body = (
        <>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} />{mat(item.color)}</mesh>
          {[0.25, 0.5, 0.75].map((f, i) => (
            <mesh key={i} position={[0, h * f, d / 2 + 0.003]}>
              <boxGeometry args={[w - 0.06, 0.012, 0.006]} />
              {mat('#cfc7bd')}
            </mesh>
          ))}
        </>
      )
      break
    case 'wardrobe':
      body = (
        <>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} />{mat(item.color)}</mesh>
          <mesh position={[0, h / 2, d / 2 + 0.003]}><boxGeometry args={[0.01, h - 0.06, 0.006]} />{mat('#cfc7bd')}</mesh>
          <mesh position={[-0.05, h * 0.5, d / 2 + 0.02]}><boxGeometry args={[0.02, 0.12, 0.03]} />{mat('#9c9c9c')}</mesh>
          <mesh position={[0.05, h * 0.5, d / 2 + 0.02]}><boxGeometry args={[0.02, 0.12, 0.03]} />{mat('#9c9c9c')}</mesh>
        </>
      )
      break
    case 'nightstand': {
      const plinth = Math.min(0.05, h * 0.1)
      const bodyH = h - plinth
      const drawers = Math.max(1, Math.round(item.h / 28))
      body = (
        <>
          <mesh position={[0, plinth / 2, 0]} castShadow><boxGeometry args={[w - 0.05, plinth, d - 0.05]} />{mat('#cfc7bd')}</mesh>
          <mesh position={[0, plinth + bodyH / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, bodyH, d]} />{mat(item.color)}</mesh>
          {Array.from({ length: drawers }, (_, i) => (
            <group key={i}>
              {i > 0 && (
                <mesh position={[0, plinth + (i * bodyH) / drawers, d / 2 + 0.003]}><boxGeometry args={[w - 0.04, 0.01, 0.006]} />{mat('#cfc7bd')}</mesh>
              )}
              <mesh position={[0, plinth + ((i + 0.5) * bodyH) / drawers, d / 2 + 0.012]}>
                <boxGeometry args={[Math.min(0.12, w * 0.35), 0.014, 0.024]} />
                {mat('#9c9c9c', { metalness: 0.5, roughness: 0.35 })}
              </mesh>
            </group>
          ))}
        </>
      )
      break
    }
    case 'sofa': {
      const seatH = Math.min(0.42, h * 0.5)
      const armW = Math.min(0.18, w * 0.12)
      const armH = Math.min(h - 0.05, seatH + 0.22)
      const backD = Math.min(0.22, d * 0.28)
      const inner = w - 2 * armW
      const cushions = Math.max(1, Math.round(inner / 0.7))
      const cw = inner / cushions
      const backH = Math.max(0.05, (h - seatH - 0.1) * 0.8)
      const cushion = shadeColor(item.color, 1.06)
      body = (
        <>
          <mesh position={[0, seatH / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, seatH, d]} />{mat(item.color)}</mesh>
          <mesh position={[0, h / 2, -d / 2 + backD / 2]} castShadow receiveShadow><boxGeometry args={[w, h, backD]} />{mat(item.color)}</mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * (w / 2 - armW / 2), armH / 2, 0]} castShadow receiveShadow><boxGeometry args={[armW, armH, d]} />{mat(item.color)}</mesh>
          ))}
          {Array.from({ length: cushions }, (_, i) => {
            const x = -inner / 2 + (i + 0.5) * cw
            return (
              <group key={i}>
                <mesh position={[x, seatH + 0.05, backD / 2 + 0.03]} castShadow receiveShadow>
                  <boxGeometry args={[cw - 0.03, 0.1, d - backD - 0.06]} />
                  {mat(cushion, { roughness: 1 })}
                </mesh>
                <mesh position={[x, seatH + 0.1 + backH / 2, -d / 2 + backD + 0.06]} castShadow receiveShadow>
                  <boxGeometry args={[cw - 0.04, backH, 0.12]} />
                  {mat(cushion, { roughness: 1 })}
                </mesh>
              </group>
            )
          })}
        </>
      )
      break
    }
    case 'table': {
      const top = 0.035
      const legH = Math.max(0.01, h - top)
      const leg = shadeColor(item.color, 0.88)
      body =
        item.w === item.d ? (
          <>
            <mesh position={[0, h - top / 2, 0]} castShadow receiveShadow><cylinderGeometry args={[w / 2, w / 2, top, 48]} />{mat(item.color)}</mesh>
            <mesh position={[0, legH / 2, 0]} castShadow><cylinderGeometry args={[0.035, 0.05, legH, 16]} />{mat(leg)}</mesh>
            <mesh position={[0, 0.015, 0]} castShadow><cylinderGeometry args={[w / 5, w / 4.5, 0.03, 32]} />{mat(leg)}</mesh>
          </>
        ) : (
          <>
            <mesh position={[0, h - top / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, top, d]} />{mat(item.color)}</mesh>
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
              <mesh key={i} position={[sx * (w / 2 - 0.05), legH / 2, sz * (d / 2 - 0.05)]} castShadow>
                <boxGeometry args={[0.05, legH, 0.05]} />
                {mat(leg)}
              </mesh>
            ))}
          </>
        )
      break
    }
    case 'rugRect':
      body = (
        <>
          <mesh position={[0, 0.006, 0]} receiveShadow><boxGeometry args={[w, 0.012, d]} />{mat(item.color, { roughness: 1 })}</mesh>
          {w > 0.4 && d > 0.4 && (
            <mesh position={[0, 0.013, 0]} receiveShadow><boxGeometry args={[w - 0.16, 0.002, d - 0.16]} />{mat(shadeColor(item.color, 1.12), { roughness: 1 })}</mesh>
          )}
        </>
      )
      break
    default:
      body = <mesh position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[w, h, d]} />{mat(item.color)}</mesh>
  }

  return (
    <group
      position={[cm(item.x), 0, cm(item.y)]}
      rotation={[0, (-item.rot * Math.PI) / 180, 0]}
      onPointerDown={onDown}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true) }}
      onPointerOut={() => setHover(false)}
    >
      {body}
    </group>
  )
}
