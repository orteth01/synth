import { useEffect, useRef, useState } from 'react'
import { Engine, type EngineLatency, type AmpEnvelope } from './audio/engine'
import { KeyboardInput, type MidiNote } from './input/keyboard'
import { Knob } from './ui/Knob'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function midiToName(n: MidiNote): string {
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`
}

function formatTime(s: number): string {
  if (s < 0.001) return '0 ms'
  if (s < 1) return `${(s * 1000).toFixed(s < 0.01 ? 1 : 0)} ms`
  return `${s.toFixed(2)} s`
}

const DEFAULT_AMP: AmpEnvelope = {
  attackS: 0.005,
  decayS: 0.15,
  sustain: 0.7,
  releaseS: 0.2,
}

export function App() {
  const engineRef = useRef<Engine | null>(null)
  const [started, setStarted] = useState(false)
  const [octave, setOctave] = useState(4)
  const [held, setHeld] = useState<readonly MidiNote[]>([])
  const [amp, setAmp] = useState<AmpEnvelope>(DEFAULT_AMP)
  const [latency, setLatency] = useState<EngineLatency | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const engine = new Engine()
    engineRef.current = engine

    void engine
      .init()
      .then(() => {
        engine.setAmpEnvelope(DEFAULT_AMP)
        setLatency(engine.getLatency())
      })
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

    const onPointer = () => void ensureStarted()
    window.addEventListener('pointerdown', onPointer)

    return () => {
      window.removeEventListener('pointerdown', onPointer)
      input.detach()
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    engineRef.current?.setAmpEnvelope(amp)
  }, [amp])

  return (
    <main className="min-h-full flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 max-w-2xl text-center">
        <h1 className="text-2xl font-medium tracking-tight">Synth</h1>

        <Panel title="Amp envelope">
          <Knob
            label="A"
            value={amp.attackS}
            min={0}
            max={5}
            defaultValue={DEFAULT_AMP.attackS}
            curve="exp"
            format={formatTime}
            onChange={(attackS) => setAmp((a) => ({ ...a, attackS }))}
          />
          <Knob
            label="D"
            value={amp.decayS}
            min={0}
            max={5}
            defaultValue={DEFAULT_AMP.decayS}
            curve="exp"
            format={formatTime}
            onChange={(decayS) => setAmp((a) => ({ ...a, decayS }))}
          />
          <Knob
            label="S"
            value={amp.sustain}
            min={0}
            max={1}
            defaultValue={DEFAULT_AMP.sustain}
            format={(v) => v.toFixed(2)}
            onChange={(sustain) => setAmp((a) => ({ ...a, sustain }))}
          />
          <Knob
            label="R"
            value={amp.releaseS}
            min={0}
            max={5}
            defaultValue={DEFAULT_AMP.releaseS}
            curve="exp"
            format={formatTime}
            onChange={(releaseS) => setAmp((a) => ({ ...a, releaseS }))}
          />
        </Panel>

        <p className="text-sm text-neutral-400 max-w-md">
          Type to play. <kbd className="font-mono">zsxdcvgbhnjm,l.</kbd> = chromatic
          octave from C; <kbd className="font-mono">q2w3er5t6y7ui9o0p</kbd> = octave
          above; <kbd className="font-mono">[</kbd>/<kbd className="font-mono">]</kbd>{' '}
          = octave shift. Drag knobs vertically; shift-drag fine; double-click resets.
        </p>

        <div className="flex flex-col gap-1 items-center">
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
                  {' '}
                  · latency: base {latency.baseMs.toFixed(1)}ms · output{' '}
                  {latency.outputMs.toFixed(1)}ms · total {latency.totalMs.toFixed(1)}ms
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 rounded-lg bg-neutral-900/50 border border-neutral-800">
      <span className="text-[10px] uppercase tracking-widest text-neutral-500">{title}</span>
      <div className="flex gap-3">{children}</div>
    </div>
  )
}
