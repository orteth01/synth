import type { OscSettings } from '../audio/engine'
import { Knob } from './Knob'
import { WaveSelector } from './WaveSelector'

interface Props {
  index: number
  value: OscSettings
  defaults: OscSettings
  onChange: (next: OscSettings) => void
}

export function OscPanel({ index, value, defaults, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 rounded-lg bg-neutral-900/50 border border-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...value, enabled: !value.enabled })}
            aria-pressed={value.enabled}
            aria-label={`Toggle oscillator ${index + 1}`}
            className={
              'text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ' +
              (value.enabled
                ? 'bg-neutral-200 text-neutral-900 border-neutral-200'
                : 'bg-neutral-950 text-neutral-500 border-neutral-800 hover:text-neutral-300')
            }
          >
            {value.enabled ? 'ON' : 'OFF'}
          </button>
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">
            OSC {index + 1}
          </span>
        </div>
        <WaveSelector
          value={value.waveshape}
          onChange={(waveshape) => onChange({ ...value, waveshape })}
        />
      </div>
      <div
        className={
          'flex gap-3 transition-opacity ' + (value.enabled ? '' : 'opacity-40')
        }
      >
        <Knob
          label="Coarse"
          value={value.coarse}
          min={-24}
          max={24}
          defaultValue={defaults.coarse}
          bipolar
          format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}`}
          onChange={(coarse) => onChange({ ...value, coarse })}
        />
        <Knob
          label="Fine"
          value={value.fine}
          min={-50}
          max={50}
          defaultValue={defaults.fine}
          bipolar
          format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}`}
          onChange={(fine) => onChange({ ...value, fine })}
        />
        <Knob
          label="Level"
          value={value.level}
          min={0}
          max={1}
          defaultValue={defaults.level}
          format={(v) => v.toFixed(2)}
          onChange={(level) => onChange({ ...value, level })}
        />
      </div>
    </div>
  )
}
