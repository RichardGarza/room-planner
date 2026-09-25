import { type ThreeEvent } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Item } from '../types'
import { cm } from './util'
import { Bed } from './furniture/Bed'
import { BoxItem } from './furniture/Boxes'
import { Chair } from './furniture/Chair'
import { Desk, Table } from './furniture/Desk'
import { FxContext, type Fx } from './furniture/materials'
import { RectRug, RoundRug } from './furniture/Rug'
import { Bookcase, CubeShelf } from './furniture/Shelves'
import { Sofa } from './furniture/Sofa'
import { Dresser, Nightstand, Wardrobe } from './furniture/Storage'

/* -------------------------------- furniture ------------------------------- */

/**
 * One piece of furniture in the 3D scene. The outer group is positioned by the
 * item's footprint centre and rotation and handles select / drag / hover; the
 * kind-specific components under src/scene/furniture build the actual shape.
 */
export function Furniture({ item, onStartDrag }: { item: Item; onStartDrag?: () => void }) {
  const selected = useStore((s) => s.selectedId === item.id)
  const quality = useStore((s) => s.quality)
  const select = useStore((s) => s.select)
  const snapshot = useStore((s) => s.snapshot)
  const [hover, setHover] = useState(false)

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    select(item.id)
    if (onStartDrag) { snapshot(); onStartDrag() }
  }

  const fx = useMemo<Fx>(
    () => ({
      emissive: selected ? '#ff7a3d' : hover ? '#ffb27a' : '#000000',
      ei: selected ? 0.2 : hover ? 0.1 : 0,
      fast: quality === 'fast',
    }),
    [selected, hover, quality],
  )

  return (
    <group
      position={[cm(item.x), 0, cm(item.y)]}
      rotation={[0, (-item.rot * Math.PI) / 180, 0]}
      onPointerDown={onDown}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true) }}
      onPointerOut={() => setHover(false)}
    >
      <FxContext.Provider value={fx}>
        <Piece item={item} />
        {selected && <Footprint item={item} />}
      </FxContext.Provider>
    </group>
  )
}

export default Furniture

function Piece({ item }: { item: Item }) {
  switch (item.kind) {
    case 'bed': return <Bed item={item} />
    case 'chair': return <Chair item={item} />
    case 'desk': return <Desk item={item} />
    case 'table': return <Table item={item} />
    case 'dresser': return <Dresser item={item} />
    case 'nightstand': return <Nightstand item={item} />
    case 'wardrobe': return <Wardrobe item={item} />
    case 'bookcase': return <Bookcase item={item} />
    case 'shelf': return <CubeShelf item={item} />
    case 'sofa': return <Sofa item={item} />
    case 'rug': return <RoundRug item={item} />
    case 'rugRect': return <RectRug item={item} />
    default: return <BoxItem item={item} />
  }
}

/** Pink outline of the footprint on the floor while the item is selected. */
function Footprint({ item }: { item: Item }) {
  const w = cm(item.w) + 0.06, d = cm(item.d) + 0.06
  const t = 0.02
  const y = 0.003
  if (item.kind === 'rug') {
    const R = w / 2
    return (
      <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R, R + t, 64]} />
        <meshBasicMaterial color="#e5407a" depthWrite={false} toneMapped={false} />
      </mesh>
    )
  }
  const sides: [number, number, number, number][] = [
    [0, -d / 2, w, t], [0, d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d],
  ]
  return (
    <>
      {sides.map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[sx, 0.004, sz]} />
          <meshBasicMaterial color="#e5407a" depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  )
}
