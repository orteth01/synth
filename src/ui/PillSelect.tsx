interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  value: T
  options: ReadonlyArray<Option<T>>
  onChange: (v: T) => void
}

export function PillSelect<T extends string>({ value, options, onChange }: Props<T>) {
  return (
    <div className="flex gap-0.5 bg-neutral-950 rounded p-0.5 border border-neutral-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            'text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ' +
            (value === o.value
              ? 'bg-neutral-200 text-neutral-900'
              : 'text-neutral-400 hover:text-neutral-200')
          }
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
