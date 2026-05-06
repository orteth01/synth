import type { Waveshape } from '../audio/engine'
import { PillSelect } from './PillSelect'

const SHAPES: ReadonlyArray<{ value: Waveshape; label: string }> = [
  { value: 'saw', label: 'Saw' },
  { value: 'square', label: 'Sqr' },
  { value: 'triangle', label: 'Tri' },
  { value: 'pulse', label: 'Pls' },
]

interface Props {
  value: Waveshape
  onChange: (v: Waveshape) => void
}

export function WaveSelector({ value, onChange }: Props) {
  return <PillSelect value={value} options={SHAPES} onChange={onChange} />
}
