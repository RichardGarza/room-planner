import type { Item } from '../../types'
import { cm } from '../util'
import { doorCount, drawerGrid, dresserVariant, isWoodTone, nightstandDrawers, shade } from './layout'
import { Metal, Painted, Surface, useFx } from './materials'
import { Bar, Box, Cyl, Knob, Legs, RBox } from './props'

const GAP = 0.012
const TOP = 0.025

/** Carcass shade: darker so the drawer gaps read as shadow lines. */
const inner = (c: string) => shade(c, 0.8)

/**
 * Dresser / chest of drawers: plinth, carcass, overhanging top and a grid of inset
 * drawer fronts with bar handles or knobs. Changing tables get a rim, TV stands
 * legs, play kitchens a hob.
 */
export function Dresser({ item }: { item: Item }) {
  const { fast } = useFx()
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const variant = dresserVariant(item.name)
  const { rows, cols } = drawerGrid(item.name, item.w, item.h)
  const noHandles = /malm/i.test(item.name)
  const legs = variant === 'tv'
  const plinth = legs ? 0.1 : Math.min(0.06, h * 0.1)
  const rim = variant === 'changing' ? 0.07 : 0
  const bodyH = h - plinth - TOP - rim
  const x0 = -w / 2 + 0.02, y0 = plinth + 0.012
  const cw = (w - 0.04) / cols, rh = (bodyH - 0.024) / rows
  const wide = cw > 0.5
  const front = isWoodTone(item.color) ? shade(item.color, 1.04) : item.color

  return (
    <>
      {legs ? (
        <Legs w={w} d={d} h={plinth} inset={0.06} r={0.02} taper={0.6}><Metal color="#3a3d42" roughness={0.4} /></Legs>
      ) : (
        <Box size={[w - 0.06, plinth, d - 0.06]} at={[0, plinth / 2, 0]}><Painted color={shade(item.color, 0.62)} /></Box>
      )}
      <Box size={[w - 0.02, bodyH, d - 0.02]} at={[0, plinth + bodyH / 2, -0.005]}><Painted color={inner(item.color)} /></Box>
      <RBox size={[w, TOP, d]} at={[0, plinth + bodyH + TOP / 2, 0]} radius={0.006}><Surface color={item.color} tile={2} /></RBox>

      {Array.from({ length: rows * cols }, (_, i) => {
        const c = i % cols, r = Math.floor(i / cols)
        const x = x0 + (c + 0.5) * cw
        const y = y0 + (rows - 1 - r + 0.5) * rh
        return (
          <group key={i}>
            <RBox size={[cw - GAP, rh - GAP, 0.02]} at={[x, y, d / 2 - 0.01]} radius={0.004}><Surface color={front} tile={1} /></RBox>
            {!noHandles && (wide ? (
              <Bar length={Math.min(0.16, cw * 0.4)} at={[x, y, d / 2 + 0.014]} />
            ) : (
              <Knob at={[x, y, d / 2 + 0.01]} />
            ))}
          </group>
        )
      })}

      {variant === 'changing' && (
        <>
          <Box size={[0.02, rim, d]} at={[-w / 2 + 0.01, h - rim / 2, 0]}><Painted color={item.color} /></Box>
          <Box size={[0.02, rim, d]} at={[w / 2 - 0.01, h - rim / 2, 0]}><Painted color={item.color} /></Box>
          <Box size={[w - 0.04, rim, 0.02]} at={[0, h - rim / 2, -d / 2 + 0.01]}><Painted color={item.color} /></Box>
          <RBox size={[w - 0.08, 0.04, d - 0.06]} at={[0, h - rim + 0.02, 0.01]} radius={0.015}><Painted color="#f6f2ec" roughness={0.9} /></RBox>
        </>
      )}
      {variant === 'kitchen' && !fast && (
        <>
          {[-1, 1].map((sx) => (
            <Cyl key={sx} r={Math.min(0.08, w * 0.12)} h={0.006} at={[sx * w * 0.2, h + 0.003, 0.02]} seg={20}><Painted color="#3a3d42" roughness={0.4} /></Cyl>
          ))}
          <Cyl r={0.01} h={0.16} at={[0, h + 0.08, -d / 2 + 0.06]} seg={8}><Metal /></Cyl>
        </>
      )}
    </>
  )
}

/** Nightstand: tapered legs, open cubby below one or two drawers, small top overhang. */
export function Nightstand({ item }: { item: Item }) {
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const drawers = nightstandDrawers(item.h)
  const legH = h >= 0.5 ? 0.12 : 0.05
  const bodyH = h - legH - TOP
  const t = 0.018
  const drawerH = Math.min(0.16, bodyH / (drawers + 0.8))
  const drawerZone = drawers * drawerH
  const cubbyH = bodyH - drawerZone
  const top = legH + bodyH

  return (
    <>
      <Legs w={w} d={d} h={legH} inset={0.04} r={0.018} taper={0.6}><Surface color={isWoodTone(item.color) ? shade(item.color, 0.9) : '#c9b28f'} /></Legs>
      {/* sides, back, bottom shelf */}
      {[-1, 1].map((sx) => (
        <Box key={sx} size={[t, bodyH, d]} at={[sx * (w / 2 - t / 2), legH + bodyH / 2, 0]}><Surface color={item.color} /></Box>
      ))}
      <Box size={[w - 2 * t, bodyH, 0.01]} at={[0, legH + bodyH / 2, -d / 2 + 0.005]}><Painted color={shade(item.color, 0.9)} /></Box>
      <Box size={[w - 2 * t, t, d - 0.01]} at={[0, legH + t / 2, 0]}><Surface color={item.color} /></Box>
      {/* drawer box above the cubby */}
      {cubbyH > 0.08 && (
        <Box size={[w - 2 * t, t, d - 0.01]} at={[0, legH + cubbyH, 0]}><Surface color={item.color} /></Box>
      )}
      <Box size={[w - 2 * t, drawerZone, d - 0.04]} at={[0, legH + cubbyH + drawerZone / 2, -0.01]}><Painted color={inner(item.color)} /></Box>
      {Array.from({ length: drawers }, (_, i) => {
        const y = legH + cubbyH + (i + 0.5) * drawerH
        return (
          <group key={i}>
            <RBox size={[w - 2 * t - GAP, drawerH - GAP, 0.02]} at={[0, y, d / 2 - 0.01]} radius={0.004}><Surface color={item.color} /></RBox>
            {w > 0.45 ? <Bar length={0.1} at={[0, y, d / 2 + 0.014]} /> : <Knob at={[0, y, d / 2 + 0.01]} r={0.011} />}
          </group>
        )
      })}
      <RBox size={[w, TOP, d]} at={[0, top + TOP / 2, 0]} radius={0.006}><Surface color={item.color} tile={2} /></RBox>
    </>
  )
}

/** Wardrobe: plinth, carcass, two or three doors with long handles and a top overhang. */
export function Wardrobe({ item }: { item: Item }) {
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const doors = doorCount(item.w)
  const plinth = 0.06
  const top = 0.03
  const bodyH = h - plinth - top
  const dw = (w - 0.02) / doors
  const doorH = bodyH - 0.02
  const handleY = Math.min(h * 0.5, plinth + 1.1)
  const handleLen = Math.min(0.32, doorH * 0.3)

  return (
    <>
      <Box size={[w - 0.06, plinth, d - 0.06]} at={[0, plinth / 2, 0]}><Painted color={shade(item.color, 0.62)} /></Box>
      <Box size={[w - 0.02, bodyH, d - 0.02]} at={[0, plinth + bodyH / 2, -0.005]}><Painted color={inner(item.color)} /></Box>
      <RBox size={[w, top, d]} at={[0, plinth + bodyH + top / 2, 0]} radius={0.006}><Surface color={item.color} tile={2} /></RBox>
      {Array.from({ length: doors }, (_, i) => {
        const x = -w / 2 + 0.01 + (i + 0.5) * dw
        // handle sits on the edge that meets the next door (or the right edge of a single door)
        const edge = doors === 1 ? 1 : i < doors / 2 ? 1 : -1
        const hx = x + edge * (dw / 2 - 0.05)
        return (
          <group key={i}>
            <RBox size={[dw - 0.008, doorH, 0.02]} at={[x, plinth + 0.01 + doorH / 2, d / 2 - 0.01]} radius={0.004}><Surface color={item.color} /></RBox>
            <Bar length={handleLen} at={[hx, handleY, d / 2 + 0.014]} vertical />
          </group>
        )
      })}
    </>
  )
}
