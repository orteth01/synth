// 4-term Blackman-Harris, peak side lobe ≈ −92 dB.
export function blackmanHarris(N: number): Float64Array {
  const a0 = 0.35875
  const a1 = 0.48829
  const a2 = 0.14128
  const a3 = 0.01168
  const w = new Float64Array(N)
  const denom = N - 1
  for (let n = 0; n < N; n++) {
    const t = (2 * Math.PI * n) / denom
    w[n] = a0 - a1 * Math.cos(t) + a2 * Math.cos(2 * t) - a3 * Math.cos(3 * t)
  }
  return w
}
