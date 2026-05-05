import { useRef, useState } from 'react'

export interface KnobProps {
  label: string
  value: number
  min: number
  max: number
  defaultValue?: number
  curve?: 'linear' | 'exp'
  bipolar?: boolean
  format?: (v: number) => string
  onChange: (v: number) => void
  size?: number
}

const ANGLE_RANGE_DEG = 270
const ANGLE_START_DEG = -135
const COARSE_PIXELS_PER_RANGE = 200
const FINE_PIXELS_PER_RANGE = 1500

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

// Map value to [0, 1] in display space (linear or exponential).
function toNormalized(value: number, min: number, max: number, curve: 'linear' | 'exp'): number {
  const t = (value - min) / (max - min)
  if (curve === 'linear') return clamp(t, 0, 1)
  // Exponential: smaller values get more visual range. For time/freq controls.
  const lo = Math.max(min, 1e-5)
  const hi = max
  if (value <= lo) return 0
  return clamp(Math.log(value / lo) / Math.log(hi / lo), 0, 1)
}

function fromNormalized(t: number, min: number, max: number, curve: 'linear' | 'exp'): number {
  if (curve === 'linear') return min + t * (max - min)
  const lo = Math.max(min, 1e-5)
  const hi = max
  if (t <= 0) return min
  return lo * Math.pow(hi / lo, t)
}

export function Knob({
  label,
  value,
  min,
  max,
  defaultValue,
  curve = 'linear',
  bipolar = false,
  format,
  onChange,
  size = 56,
}: KnobProps) {
  const dragStart = useRef<{ y: number; value: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const normalized = toNormalized(value, min, max, curve)
  const angle = ANGLE_START_DEG + normalized * ANGLE_RANGE_DEG
  const display = format ? format(value) : value.toFixed(2)

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = { y: e.clientY, value }
    setDragging(true)
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const start = dragStart.current
    if (!start) return
    const sensitivity = e.shiftKey ? FINE_PIXELS_PER_RANGE : COARSE_PIXELS_PER_RANGE
    const startNorm = toNormalized(start.value, min, max, curve)
    const deltaNorm = (start.y - e.clientY) / sensitivity
    const next = fromNormalized(clamp(startNorm + deltaNorm, 0, 1), min, max, curve)
    onChange(next)
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragStart.current = null
    setDragging(false)
  }

  function onDoubleClick() {
    if (defaultValue !== undefined) onChange(clamp(defaultValue, min, max))
  }

  // Build the arc track path in SVG coordinates.
  const r = 22
  const startRad = (ANGLE_START_DEG - 90) * (Math.PI / 180)
  const endRad = (ANGLE_START_DEG + ANGLE_RANGE_DEG - 90) * (Math.PI / 180)
  const trackStartX = r * Math.cos(startRad)
  const trackStartY = r * Math.sin(startRad)
  const trackEndX = r * Math.cos(endRad)
  const trackEndY = r * Math.sin(endRad)

  const valueAngleDeg = ANGLE_START_DEG + normalized * ANGLE_RANGE_DEG
  const valueRad = (valueAngleDeg - 90) * (Math.PI / 180)
  const valueEndX = r * Math.cos(valueRad)
  const valueEndY = r * Math.sin(valueRad)

  // Bipolar arcs originate at 12 o'clock and sweep either way; unipolar arcs
  // originate at the bottom-left start of the track.
  const arcOriginAngleDeg = bipolar ? 0 : ANGLE_START_DEG
  const arcOriginRad = (arcOriginAngleDeg - 90) * (Math.PI / 180)
  const arcOriginX = r * Math.cos(arcOriginRad)
  const arcOriginY = r * Math.sin(arcOriginRad)
  const sweepDelta = valueAngleDeg - arcOriginAngleDeg
  const sweepFlag = sweepDelta >= 0 ? 1 : 0
  const largeArc = Math.abs(sweepDelta) > 180 ? 1 : 0
  const valueArcVisible = bipolar
    ? Math.abs(normalized - 0.5) > 0.005
    : normalized > 0

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
      <svg
        viewBox="-32 -32 64 64"
        width={size}
        height={size}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        style={{ touchAction: 'none', cursor: dragging ? 'ns-resize' : 'pointer' }}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <circle cx={0} cy={0} r={26} fill="#16161a" stroke="#2a2a2f" strokeWidth={1} />
        <path
          d={`M ${trackStartX} ${trackStartY} A ${r} ${r} 0 1 1 ${trackEndX} ${trackEndY}`}
          fill="none"
          stroke="#2a2a2f"
          strokeWidth={3}
          strokeLinecap="round"
        />
        {valueArcVisible && (
          <path
            d={`M ${arcOriginX} ${arcOriginY} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${valueEndX} ${valueEndY}`}
            fill="none"
            stroke="#e8e8ea"
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={-18}
          stroke="#e8e8ea"
          strokeWidth={2}
          strokeLinecap="round"
          transform={`rotate(${angle})`}
        />
      </svg>
      <span className="text-[10px] font-mono text-neutral-400 tabular-nums min-w-12 text-center">
        {display}
      </span>
    </div>
  )
}
