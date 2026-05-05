import { useEffect, useRef, useState } from 'react'
import { Engine } from './audio/engine'
import { KeyboardInput, type MidiNote } from './input/keyboard'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function midiToName(n: MidiNote): string {
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`
}

export function App() {
  const engineRef = useRef<Engine | null>(null)
  const inputRef = useRef<KeyboardInput | null>(null)
  const [ready, setReady] = useState(false)
  const [octave, setOctave] = useState(4)
  const [held, setHeld] = useState<readonly MidiNote[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const input = new KeyboardInput({
      onNoteOn: (n) => {
        ensureEngine().then((engine) => engine.noteOn(n)).catch(() => {})
      },
      onNoteOff: () => engineRef.current?.noteOff(),
      onOctaveChange: setOctave,
      onHeldNotesChange: (notes) => setHeld([...notes].sort((a, b) => a - b)),
    })
    input.attach()
    inputRef.current = input
    return () => {
      input.detach()
      inputRef.current = null
      engineRef.current?.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ensureEngine() {
    if (engineRef.current) return engineRef.current
    const engine = new Engine()
    try {
      await engine.init()
      engineRef.current = engine
      setReady(true)
      return engine
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  return (
    <main
      className="min-h-full flex items-center justify-center p-8"
      onClick={() => void ensureEngine().catch(() => {})}
    >
      <div className="flex flex-col items-center gap-6 max-w-xl text-center">
        <h1 className="text-2xl font-medium tracking-tight">Synth</h1>
        <p className="text-sm text-neutral-400">
          Step 3 — type to play. Bottom row{' '}
          <kbd className="font-mono">zsxdcvgbhnjm,l.</kbd> covers one chromatic octave.
          Top row <kbd className="font-mono">q2w3er5t6y7ui9o0p</kbd> covers the octave above.
          <kbd className="font-mono">[</kbd>/<kbd className="font-mono">]</kbd> shift octave.
        </p>
        <div className="flex flex-col gap-2 items-center">
          <div className="text-sm text-neutral-300">
            octave: <span className="font-mono">{octave}</span>
          </div>
          <div className="text-sm text-neutral-300 min-h-5">
            {held.length > 0 ? (
              <>playing: <span className="font-mono">{held.map(midiToName).join(' ')}</span></>
            ) : (
              <span className="text-neutral-500">silent</span>
            )}
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          {error ? `error: ${error}` : ready ? 'audio context ready' : 'click anywhere to enable audio'}
        </p>
      </div>
    </main>
  )
}
