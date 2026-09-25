import { useStore } from '../../store'
import type { Item } from '../../types'
import { cm } from '../util'
import { bedStyle, mix, shade } from './layout'
import { Fabric, Oak, Painted, useFx } from './materials'
import { Box, RBox, Slats, type V3 } from './props'

const FRAME = '#f4f0ea'
const LEG = '#c9b28f'
const MATTRESS = '#fbfaf7'

/**
 * Bed: legs, rounded frame, headboard with upholstered panels, mattress, duvet with
 * a folded top edge, pillows and a throw. Cribs and toddler beds get rails, bunk
 * beds a second deck and a ladder. The item colour is the bedding.
 */
export function Bed({ item }: { item: Item }) {
  const bedding = useStore((s) => s.bedding)
  const { fast } = useFx()
  const w = cm(item.w), d = cm(item.d), h = cm(item.h)
  const style = bedStyle(item.name, item.w, item.h)
  const small = style === 'crib' || style === 'toddler'
  const bunk = style === 'bunk'

  const legH = small ? 0.06 : 0.1
  const frameH = small ? 0.1 : Math.min(0.2, h * 0.3)
  const mattH = small ? 0.1 : Math.min(0.2, h * 0.28)
  const frameTop = legH + frameH
  const top = frameTop + mattH
  const upholstery = mix(item.color, '#ffffff', 0.45)

  return (
    <>
      {/* legs + frame */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <RBox key={`${sx}${sz}`} size={[0.06, legH + 0.02, 0.06]} at={[sx * (w / 2 - 0.06), (legH + 0.02) / 2, sz * (d / 2 - 0.08)]} radius={0.012}>
            <Oak color={LEG} />
          </RBox>
        )),
      )}
      <RBox size={[w, frameH, d - 0.06]} at={[0, legH + frameH / 2, 0.03]} radius={0.025}>
        <Painted color={FRAME} />
      </RBox>

      {/* headboard */}
      {style !== 'crib' && (
        <Headboard w={w} d={d} h={bunk ? top + 0.35 : h} legH={legH} top={top} color={upholstery} fast={fast} />
      )}

      <Deck w={w} d={d} y={frameTop} mattH={mattH} bedding={bedding} color={item.color} small={small} fast={fast} />

      {/* crib: rails all round; toddler bed: guards along the sides */}
      {style === 'crib' && (
        <>
          {[-1, 1].map((sx) => (
            <Rail key={sx} length={d - 0.1} height={h - frameTop} at={[sx * (w / 2 - 0.02), frameTop, 0.03]} rot={[0, Math.PI / 2, 0]} />
          ))}
          {[-1, 1].map((sz) => (
            <Rail key={sz} length={w - 0.05} height={h - frameTop} at={[0, frameTop, sz * (d / 2 - 0.03)]} />
          ))}
        </>
      )}
      {style === 'toddler' && (
        <>
          {[-1, 1].map((sx) => (
            <Rail key={sx} length={d * 0.5} height={Math.min(0.3, h - top)} at={[sx * (w / 2 - 0.02), top - 0.02, -d / 2 + 0.08 + d * 0.25]} rot={[0, Math.PI / 2, 0]} />
          ))}
          <Box size={[w, top - legH + 0.12, 0.04]} at={[0, legH + (top - legH + 0.12) / 2, d / 2 - 0.02]}><Painted color={FRAME} /></Box>
        </>
      )}

      {bunk && <UpperDeck w={w} d={d} h={h} mattH={mattH} bedding={bedding} color={item.color} fast={fast} />}
    </>
  )
}

function Headboard({ w, d, h, legH, top, color, fast }: { w: number; d: number; h: number; legH: number; top: number; color: string; fast: boolean }) {
  const ph = h - top - 0.1
  const panels = w > 1.3 ? 3 : 1
  const pw = (w - 0.1) / panels
  return (
    <>
      <RBox size={[w, h - legH + 0.05, 0.06]} at={[0, legH - 0.05 + (h - legH + 0.05) / 2, -d / 2 + 0.03]} radius={0.015}>
        <Painted color={FRAME} />
      </RBox>
      {ph > 0.1 &&
        Array.from({ length: fast ? 1 : panels }, (_, i) => {
          const n = fast ? 1 : panels
          const width = fast ? w - 0.1 : pw - 0.02
          const x = -((n - 1) * pw) / 2 + i * pw
          return (
            <RBox key={i} size={[width, ph, 0.05]} at={[x, top + 0.05 + ph / 2, -d / 2 + 0.06 + 0.02]} radius={0.02}>
              <Fabric color={color} />
            </RBox>
          )
        })}
    </>
  )
}

/** Mattress and bedding at a given frame-top height. */
function Deck({ w, d, y, mattH, bedding, color, small, fast }: { w: number; d: number; y: number; mattH: number; bedding: boolean; color: string; small: boolean; fast: boolean }) {
  const top = y + mattH
  const duvetD = d * 0.6
  const duvetH = small ? 0.06 : 0.09
  const pillows = w < 1.2 ? 1 : 2
  const pw = Math.min(0.55, (w - 0.16) / pillows - 0.06)
  const pd = Math.min(0.4, d * 0.2)
  const fold = mix(color, '#ffffff', 0.4)
  const throwColor = shade(color, 0.72)
  return (
    <>
      <RBox size={[w - 0.1, mattH, d - 0.16]} at={[0, y + mattH / 2, 0.04]} radius={Math.min(0.045, mattH / 2 - 0.005)}>
        <Fabric color={MATTRESS} sheen={0.2} />
      </RBox>
      {bedding && (
        <>
          {/* duvet + folded edge */}
          <RBox size={[w - 0.04, duvetH, duvetD]} at={[0, top + duvetH / 2, d / 2 - 0.04 - duvetD / 2]} radius={Math.min(0.045, duvetH / 2 - 0.004)}>
            <Fabric color={color} />
          </RBox>
          <RBox size={[w - 0.04, duvetH * 0.7, Math.min(0.22, duvetD * 0.2)]} at={[0, top + duvetH + duvetH * 0.3, d / 2 - 0.04 - duvetD + Math.min(0.22, duvetD * 0.2) / 2 + 0.02]} radius={0.025}>
            <Fabric color={fold} />
          </RBox>
          {/* drape down the sides */}
          {!fast &&
            [-1, 1].map((sx) => (
              <Box key={sx} size={[0.02, 0.16, duvetD - 0.04]} at={[sx * (w / 2 - 0.03), top - 0.05, d / 2 - 0.06 - duvetD / 2]} receive={false}>
                <Fabric color={color} />
              </Box>
            ))}
          {/* pillows leaning on the headboard */}
          {Array.from({ length: pillows }, (_, i) => {
            const x = pillows === 1 ? 0 : (i === 0 ? -1 : 1) * (pw / 2 + 0.04)
            return (
              <RBox key={i} size={[pw, 0.12, pd]} at={[x, top + 0.07, -d / 2 + 0.08 + pd / 2 + 0.06]} rot={[-0.28, (i === 0 ? 1 : -1) * 0.05, 0]} radius={0.045}>
                <Fabric color="#ffffff" sheen={0.25} />
              </RBox>
            )
          })}
          {/* throw across the foot */}
          {!small && d > 1.6 && !fast && (
            <RBox size={[w - 0.02, 0.05, 0.36]} at={[0, top + duvetH + 0.025, d / 2 - 0.3]} radius={0.024}>
              <Fabric color={throwColor} />
            </RBox>
          )}
        </>
      )}
    </>
  )
}

/** Top bar + slats: a crib side or a toddler bed guard. Runs along local x. */
function Rail({ length, height, at, rot }: { length: number; height: number; at: V3; rot?: V3 }) {
  return (
    <group position={at} rotation={rot}>
      <Box size={[length, 0.03, 0.03]} at={[0, height - 0.015, 0]}><Painted color={FRAME} /></Box>
      <Slats length={length - 0.04} height={height - 0.03} at={[0, (height - 0.03) / 2, 0]} pitch={0.075} w={0.016} d={0.016} color={FRAME} />
    </group>
  )
}

/** Second deck of a bunk bed with posts, guard rail and a ladder at the foot. */
function UpperDeck({ w, d, h, mattH, bedding, color, fast }: { w: number; d: number; h: number; mattH: number; bedding: boolean; color: string; fast: boolean }) {
  const deckY = h - 0.45
  const rungs = 4
  return (
    <>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Box key={`${sx}${sz}`} size={[0.05, h, 0.05]} at={[sx * (w / 2 - 0.025), h / 2, sz * (d / 2 - 0.025)]}><Painted color={FRAME} /></Box>
        )),
      )}
      <RBox size={[w, 0.12, d - 0.06]} at={[0, deckY - 0.06, 0]} radius={0.02}><Painted color={FRAME} /></RBox>
      <Deck w={w} d={d} y={deckY} mattH={mattH} bedding={bedding} color={color} small={false} fast={fast} />
      {/* guard rail on the open side */}
      <Box size={[0.03, 0.03, d * 0.55]} at={[w / 2 - 0.015, deckY + 0.3, 0.1]}><Painted color={FRAME} /></Box>
      <Slats length={d * 0.5} height={0.28} at={[w / 2 - 0.015, deckY + 0.14, 0.1]} pitch={0.12} color={FRAME} rot={[0, Math.PI / 2, 0]} />
      {/* ladder */}
      {[-1, 1].map((sx) => (
        <Box key={sx} size={[0.035, h - 0.1, 0.035]} at={[sx * 0.18, (h - 0.1) / 2, d / 2 - 0.02]}><Painted color={FRAME} /></Box>
      ))}
      {Array.from({ length: rungs }, (_, i) => (
        <Box key={i} size={[0.36, 0.03, 0.03]} at={[0, 0.35 + i * ((deckY - 0.5) / (rungs - 1)), d / 2 - 0.02]}><Painted color={FRAME} /></Box>
      ))}
    </>
  )
}
