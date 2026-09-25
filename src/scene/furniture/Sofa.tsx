import type { Item } from '../../types'
import { cm } from '../util'
import { cushionCount, shade } from './layout'
import { Fabric, Oak } from './materials'
import { Legs, RBox } from './props'

/** Sofa / loveseat / armchair: base, rounded arms, back, seat and back cushions, short legs. */
export function Sofa({ item }: { item: Item }) {
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const legH = 0.08
  const armW = Math.min(0.22, Math.max(0.1, w * 0.12))
  const baseH = Math.min(0.42, Math.max(0.28, h * 0.45))
  const armH = Math.min(h - 0.06, baseH + 0.22)
  const backD = Math.min(0.24, Math.max(0.14, d * 0.25))
  const inner = w - 2 * armW
  const n = cushionCount(item.w)
  const cw = inner / n
  const seatD = d - backD - 0.06
  const backH = Math.max(0.1, (h - baseH - 0.14) * 0.9)
  const cushion = shade(item.color, 1.06)
  return (
    <>
      <Legs w={w} d={d} h={legH} inset={0.08} r={0.024} taper={0.7}><Oak color="#6b5240" /></Legs>
      <RBox size={[w, baseH - legH, d - 0.02]} at={[0, legH + (baseH - legH) / 2, 0]} radius={0.03}><Fabric color={item.color} /></RBox>
      <RBox size={[inner + 0.02, h - legH, backD]} at={[0, legH + (h - legH) / 2, -d / 2 + backD / 2]} radius={0.04}><Fabric color={item.color} /></RBox>
      {[-1, 1].map((sx) => (
        <RBox key={sx} size={[armW, armH - legH, d - 0.02]} at={[sx * (w / 2 - armW / 2), legH + (armH - legH) / 2, 0]} radius={0.05}>
          <Fabric color={item.color} />
        </RBox>
      ))}
      {Array.from({ length: n }, (_, i) => {
        const x = -inner / 2 + (i + 0.5) * cw
        return (
          <group key={i}>
            <RBox size={[cw - 0.02, 0.12, seatD]} at={[x, baseH + 0.06, backD / 2 + 0.015]} radius={0.05}><Fabric color={cushion} /></RBox>
            <RBox size={[cw - 0.03, backH, 0.14]} at={[x, baseH + 0.1 + backH / 2, -d / 2 + backD + 0.06]} rot={[-0.14, 0, 0]} radius={0.05}>
              <Fabric color={cushion} />
            </RBox>
          </group>
        )
      })}
    </>
  )
}
