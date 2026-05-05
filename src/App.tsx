import { useEffect, useRef, useState } from 'react'
import { Engine, type EngineLatency } from './audio/engine'
import { KeyboardInput, type MidiNote } from './input/keyboard'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function midiToName(n: MidiNote): string {
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`
}

export function App() {
  const engineRef = useRef<Engine | null>(null)
  const inputRef = useRef<KeyboardInput | null>(null)
  const [started, setStarted] = useState(false)
  const [octave, setOctave] = useState(4)
  const [held, setHeld] = useState<readonly MidiNote[]>([])
  const [latency, setLatency] = useState<EngineLatency | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const engine = new Engine()
    engineRef.current = engine

    void engine
      .init()
      .then(() => setLatency(engine.getLatency()))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))

    const ensureStarted = async () => {
      if (!engineRef.current) return
      try {
        await engineRef.current.start()
        setStarted(true)
        setLatency(engineRef.current.getLatency())
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }

    const input = new KeyboardInput({
      onNoteOn: (n) => {
        void ensureStarted()
        engineRef.current?.noteOn(n)
      },
      onNoteOff: () => engineRef.current?.noteOff(),
      onOctaveChange: setOctave,
      onHeldNotesChange: (notes) => setHeld([...notes].sort((a, b) => a - b)),
    })
    input.attach()
    inputRef.current = input

    const onPointer = () => void ensureStarted()
    window.addEventListener('pointerdown', onPointer)

    return () => {
      window.removeEventListener('pointerdown', onPointer)
      input.detach()
      inputRef.current = null
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  return (
    <main className="min-h-full flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 max-w-xl text-center">
        <h1 className="text-2xl font-medium tracking-tight">Synth</h1>
        <p className="text-sm text-neutral-400">
          Type to play. Bottom row{' '}
          <kbd className="font-mono">zsxdcvgbhnjm,l.</kbd> covers one chromatic octave.
          Top row <kbd className="font-mono">q2w3er5t6y7ui9o0p</kbd> the octave above.{' '}
          <kbd className="font-mono">[</kbd>/<kbd className="font-mono">]</kbd> shift octave.
        </p>
        <div className="flex flex-col gap-2 items-center">
          <div className="text-sm text-neutral-300">
            octave: <span className="font-mono">{octave}</span>
          </div>
          <div className="text-sm text-neutral-300 min-h-5">
            {held.length > 0 ? (
              <>
                playing: <span className="font-mono">{held.map(midiToName).join(' ')}</span>
              </>
            ) : (
              <span className="text-neutral-500">silent</span>
            )}
          </div>
        </div>
        <div className="text-xs text-neutral-500 font-mono">
          {error ? (
            `error: ${error}`
          ) : (
            <>
              {started ? 'audio: running' : 'audio: suspended (press a key)'}
              {latency && (
                <>
                  {' '}· latency: base {latency.baseMs.toFixed(1)}ms · output{' '}
                  {latency.outputMs.toFixed(1)}ms · total{' '}
                  {latency.totalMs.toFixed(1)}ms
                </>
              )}
            </>
          )}
        </div>
        {latency && latency.totalMs > 50 && (
          <p className="text-xs text-amber-400/80">
            High output latency ({latency.totalMs.toFixed(0)} ms). Bluetooth output is
            the usual cause — try wired or built-in speakers.
          </p>
        )}
      </div>
    </main>
  )
}
