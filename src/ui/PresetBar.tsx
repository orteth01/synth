import { type Preset } from '../state/presets'

interface Props {
  factory: ReadonlyArray<Preset>
  user: ReadonlyArray<Preset>
  selectedName: string | null
  onSelect: (name: string) => void
  onSave: () => void
  onDelete: () => void
}

export function PresetBar({ factory, user, selectedName, onSelect, onSave, onDelete }: Props) {
  const isUser = selectedName !== null && user.some((p) => p.name === selectedName)
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900/50 border border-neutral-800">
      <span className="text-[10px] uppercase tracking-widest text-neutral-500">Preset</span>
      <select
        value={selectedName ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="text-xs font-mono bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-neutral-200 min-w-44"
      >
        {selectedName === null && (
          <option value="" disabled hidden>
            (unsaved)
          </option>
        )}
        <optgroup label="Factory">
          {factory.map((p) => (
            <option key={`f:${p.name}`} value={p.name}>
              {p.name}
            </option>
          ))}
        </optgroup>
        {user.length > 0 && (
          <optgroup label="User">
            {user.map((p) => (
              <option key={`u:${p.name}`} value={p.name}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <button
        type="button"
        onClick={onSave}
        className="text-[10px] font-mono text-neutral-300 hover:text-white px-2 py-1 rounded border border-neutral-700"
      >
        Save…
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={!isUser}
        className="text-[10px] font-mono px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:text-white disabled:text-neutral-600 disabled:cursor-not-allowed"
      >
        Delete
      </button>
    </div>
  )
}
