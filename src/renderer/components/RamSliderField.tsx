interface Props {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  invalid?: boolean
  disabled?: boolean
}

export function RamSliderField({
  label,
  value,
  min,
  max,
  step = 256,
  onChange,
  invalid,
  disabled
}: Props): React.JSX.Element {
  return (
    <label className={`field${invalid ? ' field-invalid' : ''}`}>
      {label}
      <div className="slider-row">
        <input
          className="ram-slider"
          type="range"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={Math.min(max, Math.max(min, value))}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          className="ram-number"
          type="number"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </label>
  )
}
