import type { Item } from '../../types'
import { cm } from '../util'
import { deskLegs, isWoodTone, shade } from './layout'
import { Metal, Oak, Surface, useFx } from './materials'
import { Box, Cyl, DeskLamp, Laptop, Legs, RBox } from './props'

const TOP = 0.03

/** Legs are oak under a painted top and dark metal under a wooden one. */
function LegMat({ color }: { color: string }) {
  return isWoodTone(color) ? <Metal color="#3a3d42" roughness={0.4} /> : <Oak color="#c9b28f" />
}

/**
 * Desk: thick top, tapered legs or panel sides with a modesty panel, and a lamp
 * and/or closed laptop to sell the scale.
 */
export function Desk({ item }: { item: Item }) {
  const { fast } = useFx()
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const legH = h - TOP
  const panels = deskLegs(item.w) === 'panels'
  return (
    <>
      <RBox size={[w, TOP, d]} at={[0, h - TOP / 2, 0]} radius={0.007}><Surface color={item.color} tile={2} /></RBox>
      {panels ? (
        <>
          {[-1, 1].map((sx) => (
            <Box key={sx} size={[0.025, legH, d - 0.08]} at={[sx * (w / 2 - 0.04), legH / 2, 0]}><Surface color={item.color} /></Box>
          ))}
          <Box size={[w - 0.1, legH * 0.45, 0.02]} at={[0, legH - legH * 0.225, -d / 2 + 0.06]}><Surface color={shade(item.color, 0.96)} /></Box>
        </>
      ) : (
        <Legs w={w} d={d} h={legH} inset={0.05} r={0.02} taper={0.6}><LegMat color={item.color} /></Legs>
      )}
      {!fast && (
        <>
          {w >= 1 && <Laptop at={[-w * 0.12, h, 0.03]} />}
          {d >= 0.45 && <DeskLamp at={[w / 2 - 0.14, h, -d / 2 + 0.14]} h={Math.min(0.42, h * 0.55)} />}
        </>
      )}
    </>
  )
}

/** Table: round with a pedestal when square, otherwise a rectangle on tapered legs. */
export function Table({ item }: { item: Item }) {
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const top = 0.035
  const legH = Math.max(0.01, h - top)
  const leg = shade(item.color, 0.85)
  if (item.w === item.d) {
    return (
      <>
        <Cyl r={w / 2} h={top} at={[0, h - top / 2, 0]} seg={48}><Surface color={item.color} tile={3} /></Cyl>
        <Cyl r={0.05} r2={0.035} h={legH - 0.03} at={[0, 0.03 + (legH - 0.03) / 2, 0]} seg={16}><Surface color={leg} /></Cyl>
        <Cyl r={w / 4.2} r2={w / 5} h={0.03} at={[0, 0.015, 0]} seg={32}><Surface color={leg} /></Cyl>
      </>
    )
  }
  return (
    <>
      <RBox size={[w, top, d]} at={[0, h - top / 2, 0]} radius={0.008}><Surface color={item.color} tile={3} /></RBox>
      <Box size={[w - 0.14, 0.05, d - 0.14]} at={[0, h - top - 0.025, 0]}><Surface color={leg} /></Box>
      <Legs w={w} d={d} h={legH} inset={0.06} r={0.03} taper={0.65}><Surface color={leg} /></Legs>
      {h < 0.55 && (
        <Box size={[w - 0.16, 0.02, d - 0.16]} at={[0, legH * 0.3, 0]}><Surface color={item.color} tile={2} /></Box>
      )}
    </>
  )
}
