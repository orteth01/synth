import type { Waveshape } from '../audio/engine'

const SHAPES: ReadonlyArray<{ value: Waveshape; label: string }> = [
  { value: 'saw', label: 'Saw' },
  { value: 'square', label: 'Sqr' },
  { value: 'triangle', label: 'Tri' },
  { value: 'pulse', label: 'Pls' },
]

interface Props {
  value: Waveshape
  onChange: (v: Waveshape) => void
}

export function WaveSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-0.5 bg-neutral-950 rounded p-0.5 border border-neutral-800">
      {SHAPES.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          className={
            'text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ' +
            (value === s.value
              ? 'bg-neutral-200 text-neutral-900'
              : 'text-neutral-400 hover:text-neutral-200')
          }
          aria-pressed={value === s.value}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
