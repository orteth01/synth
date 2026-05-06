import type { LfoSettings, LfoShape, LfoDestination } from '../audio/engine'
import { Knob } from './Knob'
import { PillSelect } from './PillSelect'

const SHAPES: ReadonlyArray<{ value: LfoShape; label: string }> = [
  { value: 'sine', label: 'Sin' },
  { value: 'triangle', label: 'Tri' },
  { value: 'square', label: 'Sqr' },
  { value: 'sh', label: 'S&H' },
]

const DESTINATIONS: ReadonlyArray<{ value: LfoDestination; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'pitch', label: 'Pitch' },
  { value: 'cutoff', label: 'Cut' },
  { value: 'amp', label: 'Amp' },
]

function formatHz(hz: number): string {
  if (hz < 1) return `${hz.toFixed(2)} Hz`
  if (hz < 10) return `${hz.toFixed(2)} Hz`
  return `${hz.toFixed(1)} Hz`
}

interface Props {
  value: LfoSettings
  defaults: LfoSettings
  onChange: (next: LfoSettings) => void
}

export function LfoPanel({ value, defaults, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 rounded-lg bg-neutral-900/50 border border-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">LFO</span>
        <PillSelect
          value={value.shape}
          options={SHAPES}
          onChange={(shape) => onChange({ ...value, shape })}
        />
      </div>
      <div className="flex gap-3">
        <Knob
          label="Rate"
          value={value.rateHz}
          min={0.05}
          max={20}
          defaultValue={defaults.rateHz}
          curve="exp"
          format={formatHz}
          onChange={(rateHz) => onChange({ ...value, rateHz })}
        />
        <Knob
          label="Depth"
          value={value.depth}
          min={0}
          max={1}
          defaultValue={defaults.depth}
          format={(v) => v.toFixed(2)}
          onChange={(depth) => onChange({ ...value, depth })}
        />
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">Dest</span>
        <PillSelect
          value={value.destination}
          options={DESTINATIONS}
          onChange={(destination) => onChange({ ...value, destination })}
        />
      </div>
    </div>
  )
}
