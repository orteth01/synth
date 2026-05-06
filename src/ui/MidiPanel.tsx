import type { MidiDevice } from '../input/midi'

interface Props {
  supported: boolean
  error: string | null
  devices: MidiDevice[]
  selectedId: string | null
  pitchBend: number
  modWheel: number
  onSelect: (id: string) => void
  onPanic: () => void
}

export function MidiPanel({
  supported,
  error,
  devices,
  selectedId,
  pitchBend,
  modWheel,
  onSelect,
  onPanic,
}: Props) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 rounded-lg bg-neutral-900/50 border border-neutral-800 min-w-56">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">MIDI</span>
        <button
          type="button"
          onClick={onPanic}
          className="text-[10px] font-mono text-neutral-400 hover:text-neutral-200 px-1.5 py-0.5 rounded border border-neutral-700"
        >
          Panic
        </button>
      </div>

      {!supported ? (
        <p className="text-xs text-neutral-500">Web MIDI not available in this browser.</p>
      ) : error ? (
        <p className="text-xs text-amber-400/80 break-words">{error}</p>
      ) : devices.length === 0 ? (
        <p className="text-xs text-neutral-500">No MIDI devices connected.</p>
      ) : (
        <select
          value={selectedId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          className="text-xs font-mono bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-neutral-200"
        >
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}

      <div className="flex justify-between text-[10px] font-mono text-neutral-500 pt-1">
        <span>
          bend: <span className="text-neutral-300">{pitchBend.toFixed(2)} st</span>
        </span>
        <span>
          mod: <span className="text-neutral-300">{modWheel.toFixed(2)}</span>
        </span>
      </div>
    </div>
  )
}
