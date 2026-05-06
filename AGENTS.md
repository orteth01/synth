# Agent guide

Context for AI coding agents (or new humans) working in this repo.
The user-facing README is `README.md`; this file captures the
non-obvious architectural decisions, build-time mechanics, and
gotchas that will save you time.

## Status

All 13 build-order steps from [`initial-plan.md`](./initial-plan.md)
are complete. The plan is the source of truth for product decisions —
re-read the relevant section before changing behavior. Notable
intentional deviations are documented in the plan itself or in
*Known limitations* in `README.md`.

Current test counts: **71 Vitest** + **3 Playwright smoke** = 74. All green.
Don't ship a change until both suites pass; if you're inflating the
counts, update them here too.

## Repo layout

```
src/
├── audio/
│   ├── dsp/             # Pure TS DSP — no worklet globals, importable from tests
│   ├── worklet/         # AudioWorkletProcessor source — imports from dsp/
│   ├── voice-allocator.ts
│   └── engine.ts        # Main-thread wrapper
├── input/
│   ├── keyboard.ts      # Computer keyboard
│   └── midi.ts          # Web MIDI
├── state/
│   ├── presets.ts       # Versioned preset format + factory presets
│   ├── preset-storage.ts # Web localStorage / Tauri filesystem dispatch
│   └── runtime.ts       # `isTauri()`
├── ui/                  # React: Knob, OscPanel, LfoPanel, MidiPanel, PresetBar,
│                        # PianoKeyboard, PillSelect, WaveSelector
└── App.tsx

scripts/build-worklets.mjs   # esbuild bundler for the worklet (NOT Vite)
src-tauri/                    # Tauri 2.x scaffold
public/worklets/              # Built worklet artifacts (gitignored)
tests/smoke.spec.ts           # Playwright
```

## Core invariants

Read these once. They explain choices that look strange in isolation.

### 1. The worklet is bundled separately from the web app

AudioWorklet code can't be loaded as TS by the browser, and Vite
doesn't have a first-class story for `audioWorklet.addModule`. Our
worklet sources (`src/audio/worklet/*.worklet.ts`) are bundled by
`scripts/build-worklets.mjs` (esbuild) into `public/worklets/`.

- **`pnpm dev`** runs `concurrently` with Vite + esbuild watcher.
- **`pnpm build`** runs `build:worklets` first, then `tsc -b && vite build`.
- The worklet is an ESM module, dynamically inlined (`bundle: true`).
- Vite picks the built `public/worklets/voice.worklet.js` up as a static
  asset, so production serves it from `dist/worklets/`.

If a worklet change isn't taking effect, the watcher hasn't rebuilt yet
or the browser cached the file. Hard reload, or restart `pnpm dev`.

### 2. DSP code lives in `src/audio/dsp/` and is pure

Every DSP module (`polyblep.ts`, `ladder.ts`, `adsr.ts`, `lfo.ts`,
`drift.ts`, `oscillator.ts`, `voice.ts`) is plain TypeScript with no
worklet-only globals (`sampleRate`, `currentFrame`, `registerProcessor`
etc.). The worklet imports them. Vitest also imports them.

**This means you can write Vitest unit tests for any DSP change
directly.** That's how the alias-floor / stability / frequency-response
tests work without an AudioContext.

When adding a new DSP module:

- Put it in `src/audio/dsp/`.
- Don't reference `sampleRate` as a global — accept `sampleRate: number`
  in the constructor or process() call.
- Add a corresponding `*.test.ts` that exercises it directly.

### 3. The voice is the unit of polyphony

`src/audio/dsp/voice.ts` owns all per-voice state: 3 oscillators, 3 drift
LFOs, the ladder filter, both ADSRs. The worklet hosts an array of 8
`Voice` instances and sums them.

Per-voice scratch buffers live on the Voice instance and are reused
across blocks — *don't allocate Float32Arrays inside `process()`*.

The global LFO is shared across voices (per plan §4.6). Do not
duplicate it per-voice.

### 4. Voice allocation is on the main thread

The engine (`src/audio/engine.ts`) owns the master `heldNotes` Map and
the `VoiceAllocator`. On `noteOn(midi, velocity)` it allocates a voice
and posts a `{ type: 'noteOn', voiceIndex, note, velocity }` message to
the worklet. The worklet just dispatches to `voices[voiceIndex]`.

Allocation priority (plan §4.6, codified in `voice-allocator.ts`):

1. free voice
2. oldest voice currently in `releasing` state
3. oldest voice in `playing` state (steal)

Mono mode = `maxActive == 1`. Last-note priority is implemented in
`Engine.noteOff` by reassigning the voice to the most-recent
still-held note (looked up via `heldNotes` Map insertion order).

Voice-stealing soft-retrigger relies on the `Voice` not resetting its
oscillator phases / envelope levels on `noteOn` — `Adsr.noteOn` only
sets the stage, level continues from current. This is intentional;
clicks are mostly avoided because the level is continuous.

### 5. Parameter binding follows §2 of the plan

Two channels:

- **`AudioParam`** for continuous values that benefit from sample-accurate
  smoothing — cutoff, resonance, oscillator levels, master gain,
  pitch bend, LFO depth/rate, mod wheel, env amount. Use `setTargetAtTime`
  with `PARAM_SMOOTH_S = 5 ms` (or `PITCH_BEND_SMOOTH_S = 10 ms`) so knob
  drags don't zipper.
- **`port.postMessage`** for discrete state — waveshape selectors, LFO
  shape, LFO destination, note on/off, voice allocation, preset apply.

Don't add a postMessage path for something that should be sample-accurate
(filter cutoff modulation), and don't add an AudioParam for a discrete
choice (waveshape).

The `automationRate` of an AudioParam decides the size of the array
the worklet receives in `parameters[name]`: length 1 if k-rate or no
automation in this block, otherwise length 128 (a-rate). The
`expandParam(src, dst)` helper in the worklet handles both cases.

### 6. Per-sample frequency for oscillators

`Oscillator.process` takes `freq: Float32Array` (one value per sample),
not a scalar. This is so per-sample drift, vibrato, and pitch-bend
modulation can be applied without aliasing the polyBLEP correction
window. The Voice computes:

```
freqBuf[i] = oscBaseFreq * (1 + totalCents * Math.LN2 / 1200)
```

`Math.LN2 / 1200` is the precomputed linear approximation factor for
small cents — accurate to <0.1% for ±100 cents. For larger pitch
swings (pitch bend up to ±12 st, filter env up to ±5 oct), use full
`Math.pow(2, x / 12)` or `Math.pow(2, x)`.

### 7. Filter quirks worth knowing

- Cutoff knob = **per-stage** cutoff. The 4-pole cascade is **−12 dB**
  at the per-stage cutoff (each pole −3 dB), not −3 dB. Canonical Moog
  ladder behavior.
- Internal 2× oversampling: the inner loop runs twice per input sample
  (linear-interpolated midpoint + current). 2-tap moving-average
  decimation. Crude but flat enough for v1 — replace with a longer
  halfband FIR if measurements complain.
- Resonance ∈ [0, 1] maps to feedback k ∈ [0, 4.5]. Loop gain crosses
  unity at k = 4, so r ≈ 0.95 self-oscillates.
- Tanh nonlinearity in every stage bounds the loop and gives the
  characteristic harmonic blooming when overdriven.

### 8. Preset format is versioned

`version: 1` at both wrapper and entry levels. Validation is strict
(`isValidPreset`); malformed entries get filtered out, not coerced.

When changing the preset shape:

- **Don't repurpose existing field names within the same version.**
- Add new optional fields freely.
- If the change is breaking, bump to `version: 2` and write a migration
  in `loadUserPresets`.

Factory preset names are reserved — UI prevents users from saving over
them.

### 9. Tauri JS plugin code is dynamically imported

`@tauri-apps/plugin-fs` is only `await import()`-ed inside
`TauriPresetStorage`, so Vite emits it as a separate chunk and web
users don't pay the bytes. If you reference a Tauri plugin elsewhere,
put it behind `if (isTauri())` and use a dynamic import.

## Testing

`pnpm test` runs Vitest on `src/**/*.test.ts`. `pnpm test:e2e` starts
Vite via `webServer` and runs Playwright on `tests/*.spec.ts`. They
don't conflict.

DSP test patterns to copy when adding new modules:

- **Bounds + finiteness**: assert no NaN/Inf and reasonable amplitude
  envelopes across long renders (1 second is plenty; the 10-second test
  in `adsr.test.ts` was originally `60 * SR` and got pulled down for
  speed — do the same).
- **Frequency-domain**: use `fft.js` and `blackmanHarris` from
  `dsp/window.ts`. Pattern in `polyblep.test.ts:aliasFloorDb`.
- **Stability fuzz**: `ladder.test.ts:'remains stable across 60 s of
  fuzzed parameter automation'` is the template — block-by-block with
  randomised params, assert magnitude bound and no non-finites.
- **State-machine transitions**: see `adsr.test.ts` — assert stage
  transitions explicitly via `currentStage`.

Don't regress test runtimes. The current suite finishes in ~3.5 s; the
`drift` test at 30s × SR was the previous slow point and got cut to 5s.
If you push a test past ~3 s of synthesised audio, ask whether you
need that or whether a shorter render proves the same property.

## Build / verify discipline

After any non-trivial change:

```sh
pnpm typecheck && pnpm test
```

After UI changes also:

```sh
pnpm test:e2e
```

After any change that touches the worklet or DSP modules:

```sh
pnpm build         # ensures the bundled worklet still compiles end-to-end
```

If you change the public API (engine, presets, voice), update the
README's *Architecture* and *Tech* sections and the relevant section
above.

## Pitfalls / already-decided

These come up easily; don't burn time rediscovering them.

- **Alias floor target is −40 dB at A4**, not −80 dB. The plan §1.1
  −80 dB number is achievable only with 2×–4× oversampling on the
  oscillator. polyBLEP without oversampling reliably hits −40 dB at
  A4 and ~−30 dB at A6. Test thresholds in `polyblep.test.ts` are
  set to those polyBLEP-realistic levels with a comment pointing at
  the deferred oversampling work.
- **Web MIDI doesn't work in macOS/Linux Tauri.** WKWebView and
  WebKitGTK don't reliably implement Web MIDI. Documented in README.
  Native Rust MIDI via `midir` is the v2 path; don't add a
  workaround on the JS side.
- **Knobs use Pointer Events with `setPointerCapture`.** Don't switch
  to MouseEvent — pointer capture is what makes drags survive the
  cursor leaving the SVG bounding box.
- **Bipolar Knob arc** anchors at 12 o'clock. Look at the
  `arcOriginAngleDeg` / `sweepFlag` math before touching it.
- **Mono = retrigger.** Legato (no envelope retrigger) and portamento
  are not implemented. Plan §4.6 mentions both as desirable; they're
  v2 candidates.
- **Anti-click ramp inside the worklet was removed** when ADSR landed
  in step 4. The ADSR's release time provides natural click prevention.
  Don't reintroduce a separate gate ramp.
- **Master soft-clip lives in the worklet** (`Math.tanh` over the
  voice sum). The post-worklet `GainNode` is just for master volume.
  Don't add another limiter to the GainNode chain.
- **Preset version bumps are migrations**, not "free upgrades".
  Decide if you want users' v1 presets discarded or transformed; if
  transformed, write the migration code.
- **Tauri build needs Rust + icons.** First-time setup:
  `pnpm tauri icon path/to/512x512.png`. The CI smoke test only covers
  the web path.

## Conventions

- TypeScript strict mode, `noUnusedLocals`, `noUnusedParameters`.
- React 19 + Tailwind 4 (CSS-first config via `@tailwindcss/vite`).
- pnpm. Don't switch to npm/yarn.
- No comments that explain the *what*. Comments only when the *why*
  is non-obvious. Existing comments mostly point at the plan section
  that justifies a decision (e.g. "per §4.2", "per §4.6").
- Imperative commit messages. One concept per commit.

## Where to look first

- *I need to change how a knob behaves*: `src/ui/Knob.tsx`.
- *I need to add a new modulation source*: `src/audio/dsp/voice.ts`,
  then surface params via the worklet (`src/audio/worklet/voice.worklet.ts`)
  and engine (`src/audio/engine.ts`).
- *I need to fix something MIDI-related*: `src/input/midi.ts` +
  `tests/midi.test.ts` for the parser.
- *I want to add a factory preset*: append to `FACTORY_PRESETS` in
  `src/state/presets.ts`. The validation test will check it's
  well-formed automatically.
- *I want to change the keyboard layout*: `src/input/keyboard.ts`
  (offset tables at top).
- *I'm seeing a worklet-load error*: check `public/worklets/` exists
  and `pnpm build:worklets` ran. Confirm the dev server serves
  `/worklets/voice.worklet.js` with `Content-Type: text/javascript`.
- *Production build broke*: `pnpm build` runs worklets → tsc → vite.
  Errors usually point at one stage.

## Plan reference

The numbered sections referenced in code comments and tests:

- §1.1 — quantitative targets (latency, CPU, alias floor, stability)
- §2 — stack and parameter-binding rules
- §4.1 — oscillators and drift
- §4.2 — pre-filter saturation
- §4.3 — ladder filter (Huovilainen, 2× oversample)
- §4.4 — RC-asymptotic ADSR; LFO shapes and routing
- §4.5 — output stage tanh limiter
- §4.6 — voice architecture, mono priority, polyphony stealing
- §5.1 — computer keyboard layout
- §5.2 — MIDI handling
- §6 — UI conventions (knobs, SVG, presets)
- §7 — build targets (web + Tauri)
- §8 — build order
- §9 — known risks ("things that will go wrong")
- §11 — definition of done
