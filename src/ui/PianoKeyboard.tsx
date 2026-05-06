import { useRef } from 'react'
import type { MidiNote } from '../input/keyboard'

const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]
const BLACK_KEYS_PER_OCTAVE: ReadonlyArray<{ offset: number; rightOfWhite: number }> = [
  { offset: 1, rightOfWhite: 0 },
  { offset: 3, rightOfWhite: 1 },
  { offset: 6, rightOfWhite: 3 },
  { offset: 8, rightOfWhite: 4 },
  { offset: 10, rightOfWhite: 5 },
]

const KEY_W = 14
const KEY_H = 80
const BLACK_W = 9
const BLACK_H = 50

interface Props {
  startMidi: number
  octaves: number
  held: ReadonlySet<MidiNote>
  onNoteOn(note: MidiNote): void
  onNoteOff(note: MidiNote): void
}

export function PianoKeyboard({ startMidi, octaves, held, onNoteOn, onNoteOff }: Props) {
  const totalWhite = octaves * 7
  const downRef = useRef(false)
  const activeRef = useRef<MidiNote | null>(null)

  const start = (midi: MidiNote) => {
    if (activeRef.current === midi) return
    if (activeRef.current !== null) onNoteOff(activeRef.current)
    onNoteOn(midi)
    activeRef.current = midi
  }
  const stop = () => {
    if (activeRef.current === null) return
    onNoteOff(activeRef.current)
    activeRef.current = null
  }

  const whiteKeys: { midi: MidiNote; x: number }[] = []
  const blackKeys: { midi: MidiNote; x: number }[] = []
  for (let oct = 0; oct < octaves; oct++) {
    const octStart = oct * 7 * KEY_W
    for (let w = 0; w < 7; w++) {
      whiteKeys.push({
        midi: startMidi + oct * 12 + WHITE_OFFSETS[w],
        x: octStart + w * KEY_W,
      })
    }
    for (const b of BLACK_KEYS_PER_OCTAVE) {
      blackKeys.push({
        midi: startMidi + oct * 12 + b.offset,
        x: octStart + (b.rightOfWhite + 1) * KEY_W - BLACK_W / 2,
      })
    }
  }

  const onContainerUp = () => {
    downRef.current = false
    stop()
  }

  return (
    <svg
      viewBox={`0 0 ${totalWhite * KEY_W} ${KEY_H}`}
      preserveAspectRatio="none"
      className="w-full max-w-4xl select-none"
      style={{ height: 110, touchAction: 'none' }}
      onPointerUp={onContainerUp}
      onPointerLeave={onContainerUp}
      onPointerCancel={onContainerUp}
    >
      {whiteKeys.map((k) => {
        const active = held.has(k.midi)
        return (
          <rect
            key={`w:${k.midi}`}
            x={k.x}
            y={0}
            width={KEY_W}
            height={KEY_H}
            fill={active ? '#7dd3fc' : '#e7e7ea'}
            stroke="#0b0b0d"
            strokeWidth={0.5}
            onPointerDown={(e) => {
              e.preventDefault()
              ;(e.currentTarget as SVGElement).setPointerCapture?.(e.pointerId)
              downRef.current = true
              start(k.midi)
            }}
            onPointerEnter={() => {
              if (downRef.current) start(k.midi)
            }}
          />
        )
      })}
      {whiteKeys
        .filter((k) => k.midi % 12 === 0)
        .map((k) => (
          <text
            key={`l:${k.midi}`}
            x={k.x + KEY_W / 2}
            y={KEY_H - 3}
            textAnchor="middle"
            fontSize={4}
            fontFamily="ui-monospace, Menlo, monospace"
            fill="#52525b"
            pointerEvents="none"
          >
            C{Math.floor(k.midi / 12) - 1}
          </text>
        ))}
      {blackKeys.map((k) => {
        const active = held.has(k.midi)
        return (
          <rect
            key={`b:${k.midi}`}
            x={k.x}
            y={0}
            width={BLACK_W}
            height={BLACK_H}
            fill={active ? '#0284c7' : '#1a1a1d'}
            stroke="#0b0b0d"
            strokeWidth={0.5}
            onPointerDown={(e) => {
              e.preventDefault()
              ;(e.currentTarget as SVGElement).setPointerCapture?.(e.pointerId)
              downRef.current = true
              start(k.midi)
            }}
            onPointerEnter={() => {
              if (downRef.current) start(k.midi)
            }}
          />
        )
      })}
    </svg>
  )
}
