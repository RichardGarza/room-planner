import { useEffect, useState } from 'react'
import { parseLength, toUnitNumber, useUnits } from '../units'

/** Small "cm | in" segmented control; every length in the app follows it at once. */
export function UnitToggle({ className }: { className?: string }) {
  const unit = useUnits((s) => s.unit)
  const setUnit = useUnits((s) => s.setUnit)
  return (
    <div className={`seg sub unit-toggle${className ? ` ${className}` : ''}`} role="group" aria-label="Units">
      <button type="button" className={unit === 'cm' ? 'on' : ''} aria-pressed={unit === 'cm'} onClick={() => setUnit('cm')} title="Show lengths in centimetres">cm</button>
      <button type="button" className={unit === 'in' ? 'on' : ''} aria-pressed={unit === 'in'} onClick={() => setUnit('in')} title="Show lengths in inches and feet">in</button>
    </div>
  )
}

interface Props {
  /** value in cm */
  value: number
  /** called with the new value in cm when the field is committed (blur, Enter or Tab) */
  onCommit: (cm: number) => void
  min?: number
  max?: number
  placeholder?: string
  className?: string
  title?: string
  disabled?: boolean
  /** optional id/name for labels */
  id?: string
}

/**
 * A length field that shows the value in the chosen unit and accepts anything
 * parseLength understands ("150", "150 in", "12' 6\"", "3 ft", "150 cm", "1.5 m").
 * The maths happens when focus leaves the field; Escape restores the old value.
 */
export function LengthInput({ value, onCommit, min = 0, max = 100000, placeholder, className, title, disabled, id }: Props) {
  const unit = useUnits((s) => s.unit)
  const shown = String(toUnitNumber(value, unit))
  const [text, setText] = useState(shown)
  const [bad, setBad] = useState(false)
  const [focused, setFocused] = useState(false)

  // keep in sync with outside changes (undo, unit toggle, drag) while not editing
  useEffect(() => { if (!focused) setText(shown) }, [shown, focused])

  const commit = () => {
    const cm = parseLength(text, unit)
    if (cm === null || !Number.isFinite(cm)) {
      setBad(true)
      setText(shown)
      setTimeout(() => setBad(false), 700)
      return
    }
    const clamped = Math.min(max, Math.max(min, cm))
    const rounded = Math.round(clamped)
    if (rounded !== Math.round(value)) onCommit(rounded)
    setText(String(toUnitNumber(rounded, unit)))
  }

  return (
    <span className={`len-input${bad ? ' bad' : ''}${className ? ` ${className}` : ''}`} title={title ?? `Type a number in ${unit}, or add a unit like 150 in, 12' 6", 3 ft, 150 cm`}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => { setFocused(true); e.target.select() }}
        onBlur={() => { setFocused(false); commit() }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() }
          if (e.key === 'Escape') { setText(shown); (e.target as HTMLInputElement).blur() }
        }}
      />
      <span className="len-unit">{unit}</span>
    </span>
  )
}
