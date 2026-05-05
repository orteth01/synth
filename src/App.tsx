import { useEffect, useRef, useState } from 'react'
import { Engine } from './audio/engine'

const A4 = 69

export function App() {
  const engineRef = useRef<Engine | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
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

  async function toggleNote() {
    try {
      const engine = await ensureEngine()
      if (playing) {
        engine.noteOff()
        setPlaying(false)
      } else {
        engine.noteOn(A4)
        setPlaying(true)
      }
    } catch {
      // surfaced via setError
    }
  }

  return (
    <main className="min-h-full flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-medium tracking-tight">Synth</h1>
        <p className="text-sm text-neutral-400">
          Step 2 — polyBLEP saw at A4. Click to play.
        </p>
        <button
          onClick={toggleNote}
          className="rounded-full px-6 py-3 bg-neutral-100 text-neutral-900 hover:bg-white transition-colors font-medium"
        >
          {playing ? 'Stop' : 'Play A4'}
        </button>
        <p className="text-xs text-neutral-500">
          {error ? `error: ${error}` : ready ? 'audio context ready' : 'awaiting first interaction'}
        </p>
      </div>
    </main>
  )
}
