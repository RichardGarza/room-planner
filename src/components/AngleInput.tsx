import { useEffect, useState } from 'react'
import { normalizeRot } from '../geometry'

/**
 * A small number field for an item's angle with a "°" suffix. Shows the current angle, lets you
 * type any number (it is normalised to 0..359 on commit) and commits on blur or Enter; Escape puts
 * the current value back.
 */
export function AngleInput({ value, onCommit }: { value: number; onCommit: (deg: number) => void }) {
  const [text, setText] = useState(String(Math.round(value)))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(String(Math.round(value)))
  }, [value, focused])
  const commit = () => {
    const n = Number(text)
    if (text.trim() === '' || !Number.isFinite(n)) { setText(String(Math.round(value))); return }
    const deg = normalizeRot(n)
    setText(String(Math.round(deg)))
    if (deg !== normalizeRot(value)) onCommit(deg)
  }
  return (
    <span className="angle-input" title="Angle (degrees, clockwise)">
      <input
        type="number"
        inputMode="numeric"
        step={1}
        value={text}
        aria-label="Angle"
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { setFocused(false); commit() }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') { setText(String(Math.round(value))); (e.target as HTMLInputElement).blur() }
        }}
      />
      <span className="angle-unit">°</span>
    </span>
  )
}
