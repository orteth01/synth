import { useEffect, useRef, useState } from 'react'
import {
  Engine,
  type EngineLatency,
  type AmpEnvelope,
  type FilterSettings,
  type FilterEnvelope,
  type OscSettings,
  type LfoSettings,
} from './audio/engine'
import { KeyboardInput, type MidiNote } from './input/keyboard'
import { MidiInput, type MidiDevice } from './input/midi'
import { Knob } from './ui/Knob'
import { OscPanel } from './ui/OscPanel'
import { LfoPanel } from './ui/LfoPanel'
import { MidiPanel } from './ui/MidiPanel'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function midiToName(n: MidiNote): string {
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`
}

function formatTime(s: number): string {
  if (s < 0.001) return '0 ms'
  if (s < 1) return `${(s * 1000).toFixed(s < 0.01 ? 1 : 0)} ms`
  return `${s.toFixed(2)} s`
}

function formatHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz`
  return `${hz.toFixed(0)} Hz`
}

function formatSigned(v: number): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
}

const DEFAULT_OSCS: OscSettings[] = [
  { waveshape: 'saw', coarse: 0, fine: 0, level: 0.7 },
  { waveshape: 'saw', coarse: 0, fine: -7, level: 0.5 },
  { waveshape: 'square', coarse: -12, fine: 0, level: 0.3 },
]

const DEFAULT_AMP: AmpEnvelope = {
  attackS: 0.005,
  decayS: 0.15,
  sustain: 0.7,
  releaseS: 0.2,
}

const DEFAULT_FILTER: FilterSettings = {
  cutoffHz: 800,
  resonance: 0.3,
}

const DEFAULT_FILTER_ENV: FilterEnvelope = {
  attackS: 0.01,
  decayS: 0.4,
  sustain: 0,
  releaseS: 0.3,
  envAmount: 0.5,
}

const DEFAULT_LFO: LfoSettings = {
  shape: 'triangle',
  rateHz: 5,
  depth: 0,
  destination: 'pitch',
}

const DEFAULT_VOICES = 8
const MIN_VOICES = 1
const MAX_VOICES = 8

export function App() {
  const engineRef = useRef<Engine | null>(null)
  const midiRef = useRef<MidiInput | null>(null)
  const [started, setStarted] = useState(false)
  const [octave, setOctave] = useState(4)
  const [keyboardHeld, setKeyboardHeld] = useState<readonly MidiNote[]>([])
  const [midiHeld, setMidiHeld] = useState<readonly MidiNote[]>([])
  const [oscs, setOscs] = useState<OscSettings[]>(DEFAULT_OSCS)
  const [amp, setAmp] = useState<AmpEnvelope>(DEFAULT_AMP)
  const [filter, setFilter] = useState<FilterSettings>(DEFAULT_FILTER)
  const [filterEnv, setFilterEnv] = useState<FilterEnvelope>(DEFAULT_FILTER_ENV)
  const [lfo, setLfo] = useState<LfoSettings>(DEFAULT_LFO)
  const [voices, setVoices] = useState(DEFAULT_VOICES)
  const [latency, setLatency] = useState<EngineLatency | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [midiSupported, setMidiSupported] = useState(true)
  const [midiError, setMidiError] = useState<string | null>(null)
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([])
  const [midiSelectedId, setMidiSelectedId] = useState<string | null>(null)
  const [pitchBend, setPitchBend] = useState(0)
  const [modWheel, setModWheel] = useState(0)

  useEffect(() => {
    const engine = new Engine()
    engineRef.current = engine

    void engine
      .init()
      .then(() => {
        DEFAULT_OSCS.forEach((s, i) => engine.setOscillator(i as 0 | 1 | 2, s))
        engine.setAmpEnvelope(DEFAULT_AMP)
        engine.setFilter(DEFAULT_FILTER)
        engine.setFilterEnvelope(DEFAULT_FILTER_ENV)
        engine.setLfo(DEFAULT_LFO)
        engine.setMaxVoices(DEFAULT_VOICES)
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
        engineRef.current?.noteOn(n, 1)
      },
      onNoteOff: (n) => engineRef.current?.noteOff(n),
      onOctaveChange: setOctave,
      onHeldNotesChange: (notes) => setKeyboardHeld([...notes].sort((a, b) => a - b)),
    })
    input.attach()

    const midiHeldSet = new Set<MidiNote>()
    const midi = new MidiInput({
      onNoteOn: (n, v) => {
        void ensureStarted()
        engineRef.current?.noteOn(n, v)
        midiHeldSet.add(n)
        setMidiHeld([...midiHeldSet].sort((a, b) => a - b))
      },
      onNoteOff: (n) => {
        engineRef.current?.noteOff(n)
        midiHeldSet.delete(n)
        setMidiHeld([...midiHeldSet].sort((a, b) => a - b))
      },
      onPitchBend: (st) => {
        engineRef.current?.setPitchBend(st)
        setPitchBend(st)
      },
      onModWheel: (v) => {
        engineRef.current?.setModWheel(v)
        setModWheel(v)
      },
      onPanic: () => {
        engineRef.current?.allNotesOff()
        engineRef.current?.setPitchBend(0)
        engineRef.current?.setModWheel(0)
        midiHeldSet.clear()
        setMidiHeld([])
        setPitchBend(0)
        setModWheel(0)
      },
      onDevicesChange: setMidiDevices,
      onSelectedDeviceChange: setMidiSelectedId,
      onError: setMidiError,
    })
    midiRef.current = midi
    setMidiSupported(midi.isSupported())
    void midi.start()

    const onPointer = () => void ensureStarted()
    window.addEventListener('pointerdown', onPointer)

    return () => {
      window.removeEventListener('pointerdown', onPointer)
      input.detach()
      midi.stop()
      midiRef.current = null
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    oscs.forEach((s, i) => engineRef.current?.setOscillator(i as 0 | 1 | 2, s))
  }, [oscs])

  useEffect(() => {
    engineRef.current?.setAmpEnvelope(amp)
  }, [amp])

  useEffect(() => {
    engineRef.current?.setFilter(filter)
  }, [filter])

  useEffect(() => {
    engineRef.current?.setFilterEnvelope(filterEnv)
  }, [filterEnv])

  useEffect(() => {
    engineRef.current?.setLfo(lfo)
  }, [lfo])

  useEffect(() => {
    engineRef.current?.setMaxVoices(voices)
  }, [voices])

  const playingDisplay = (() => {
    const all = new Set<MidiNote>(keyboardHeld)
    for (const n of midiHeld) all.add(n)
    return [...all].sort((a, b) => a - b)
  })()

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-5 max-w-6xl">
        <h1 className="text-2xl font-medium tracking-tight">Synth</h1>

        <div className="flex flex-wrap gap-3 justify-center">
          {oscs.map((osc, i) => (
            <OscPanel
              key={i}
              index={i}
              value={osc}
              defaults={DEFAULT_OSCS[i]}
              onChange={(next) =>
                setOscs((prev) => prev.map((p, idx) => (idx === i ? next : p)))
              }
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <Panel title="Filter">
            <Knob
              label="Cutoff"
              value={filter.cutoffHz}
              min={20}
              max={20000}
              defaultValue={DEFAULT_FILTER.cutoffHz}
              curve="exp"
              format={formatHz}
              onChange={(cutoffHz) => setFilter((f) => ({ ...f, cutoffHz }))}
            />
            <Knob
              label="Reso"
              value={filter.resonance}
              min={0}
              max={1}
              defaultValue={DEFAULT_FILTER.resonance}
              format={(v) => v.toFixed(2)}
              onChange={(resonance) => setFilter((f) => ({ ...f, resonance }))}
            />
          </Panel>

          <Panel title="Filter envelope">
            <Knob
              label="Amt"
              value={filterEnv.envAmount}
              min={-1}
              max={1}
              defaultValue={DEFAULT_FILTER_ENV.envAmount}
              bipolar
              format={formatSigned}
              onChange={(envAmount) => setFilterEnv((e) => ({ ...e, envAmount }))}
            />
            <Knob
              label="A"
              value={filterEnv.attackS}
              min={0}
              max={5}
              defaultValue={DEFAULT_FILTER_ENV.attackS}
              curve="exp"
              format={formatTime}
              onChange={(attackS) => setFilterEnv((e) => ({ ...e, attackS }))}
            />
            <Knob
              label="D"
              value={filterEnv.decayS}
              min={0}
              max={5}
              defaultValue={DEFAULT_FILTER_ENV.decayS}
              curve="exp"
              format={formatTime}
              onChange={(decayS) => setFilterEnv((e) => ({ ...e, decayS }))}
            />
            <Knob
              label="S"
              value={filterEnv.sustain}
              min={0}
              max={1}
              defaultValue={DEFAULT_FILTER_ENV.sustain}
              format={(v) => v.toFixed(2)}
              onChange={(sustain) => setFilterEnv((e) => ({ ...e, sustain }))}
            />
            <Knob
              label="R"
              value={filterEnv.releaseS}
              min={0}
              max={5}
              defaultValue={DEFAULT_FILTER_ENV.releaseS}
              curve="exp"
              format={formatTime}
              onChange={(releaseS) => setFilterEnv((e) => ({ ...e, releaseS }))}
            />
          </Panel>

          <LfoPanel value={lfo} defaults={DEFAULT_LFO} onChange={setLfo} />

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

          <Panel title="Voices">
            <Knob
              label={voices === 1 ? 'Mono' : 'Poly'}
              value={voices}
              min={MIN_VOICES}
              max={MAX_VOICES}
              defaultValue={DEFAULT_VOICES}
              format={(v) => Math.round(v).toString()}
              onChange={(v) => setVoices(Math.round(v))}
            />
          </Panel>

          <MidiPanel
            supported={midiSupported}
            error={midiError}
            devices={midiDevices}
            selectedId={midiSelectedId}
            pitchBend={pitchBend}
            modWheel={modWheel}
            onSelect={(id) => midiRef.current?.selectDevice(id)}
            onPanic={() => midiRef.current?.panic()}
          />
        </div>

        <p className="text-sm text-neutral-400 max-w-md text-center">
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
            {playingDisplay.length > 0 ? (
              <>
                playing:{' '}
                <span className="font-mono">{playingDisplay.map(midiToName).join(' ')}</span>
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
