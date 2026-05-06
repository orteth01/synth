# Synth

A digital Moog-style monosynth (with optional polyphony) that runs in the
browser and as a desktop app. Three antialiased oscillators feeding a
nonlinear 4-pole ladder filter, two RC-asymptotic envelopes, an LFO with
routable modulation, and per-oscillator drift for analog character.

Built end-to-end from [`initial-plan.md`](./initial-plan.md).

## Quick start

### Web

```sh
pnpm install
pnpm dev          # http://localhost:5173
```

Open the app, click anywhere to enable audio, then play with the on-screen
piano, your computer keyboard, or any connected MIDI device.

### Desktop

The desktop shell uses [Tauri 2](https://tauri.app/) and requires the
[Rust toolchain](https://rustup.rs).

```sh
pnpm install
pnpm tauri icon path/to/512x512.png   # one-time, generates platform icons
pnpm tauri dev                         # development window
pnpm tauri build                       # produces installers in src-tauri/target/release
```

## Playing

### Computer keyboard

| Keys                          | Action                             |
| ----------------------------- | ---------------------------------- |
| `zsxdcvgbhnjm,l.`             | Chromatic octave starting at C     |
| `q2w3er5t6y7ui9o0p`            | Octave above the bottom row        |
| `[`                           | Octave down                        |
| `]`                           | Octave up                          |

### MIDI

Plug in a USB MIDI device. The web app supports:

- Note on/off with velocity (mapped to amp envelope peak).
- Pitch bend (±2 semitones).
- CC1 (mod wheel) → LFO depth.
- CC64 (sustain pedal) → defers note-offs until release.
- CC120/123 (panic) → all notes off.

Hot-plug works — devices appear and disappear in the MIDI panel as you
connect/disconnect them.

### On-screen keyboard

Three octaves at the bottom (C3 to B5). Click a key to play; drag across
keys for glissando. Highlights notes from any input source.

### Knobs

Drag vertically. Hold **Shift** for fine adjustment. Double-click to
reset to a sensible neutral value. Bipolar knobs (envelope amount, coarse
tune, fine tune) anchor at 12 o'clock.

## Voices

Mono with last-note priority is the default for the Moog Bass preset. The
Master panel's right-hand knob sets the polyphony (1 = mono, up to 8).
When voices are stolen, allocation prefers free → oldest releasing →
oldest playing.

## Presets

Four factory presets ship: Moog Bass, Bright Lead, Lush Pad, S&H Wobble.
Use the preset bar at the top to switch.

User presets are stored in versioned JSON:

- **Web**: `localStorage` under `synth.userPresets.v1`.
- **Desktop**: `presets.v1.json` in the OS app data directory
  (e.g. `~/Library/Application Support/com.synth.local/` on macOS).

Save creates or overwrites a user preset; factory names are reserved.
Delete is enabled when a user preset is the current selection.

## Architecture

```
src/
├── audio/
│   ├── dsp/             # Pure TypeScript DSP (polyBLEP, ladder, ADSR, drift, LFO, voice)
│   ├── worklet/         # AudioWorkletProcessor — imports dsp/, bundled by esbuild
│   ├── voice-allocator.ts
│   └── engine.ts        # Main-thread wrapper around the AudioContext
├── input/
│   ├── keyboard.ts      # Computer keyboard mapping
│   └── midi.ts          # Web MIDI handler (sustain, pitch bend, mod wheel, panic)
├── state/
│   ├── presets.ts       # Versioned preset format + factory presets
│   ├── preset-storage.ts # Web localStorage / Tauri filesystem dispatch
│   └── runtime.ts       # Tauri detection
├── ui/                  # React components: Knob, OscPanel, LfoPanel, MidiPanel,
│   │                    # PresetBar, PianoKeyboard, PillSelect, WaveSelector
│   └── ...
└── App.tsx
```

The DSP runs in a single `AudioWorkletProcessor` that hosts an array of 8
voices. The processor sums voices and applies a master `tanh` soft clip;
a `GainNode` after the worklet provides master volume. Per-sample
modulation buffers (cutoff, resonance, LFO output, depth) are reused
across blocks; nothing in the inner DSP loop allocates.

## Known limitations

- **MIDI on the desktop shell.** Tauri 2 uses the OS-native webview. On
  macOS (WKWebView) and Linux (WebKitGTK) the Web MIDI API is unreliable
  or absent. Use the **web build in Chrome / Edge** for MIDI on those
  platforms; the Tauri app still works for keyboard, mouse, and preset
  management. On Windows (WebView2) MIDI works.
- **Unsigned desktop binaries.** v1 desktop builds are not codesigned or
  notarised. macOS users may need to right-click → Open to bypass
  Gatekeeper the first time. Windows users may need to dismiss
  SmartScreen.
- **Bluetooth audio adds 150–300 ms** of round-trip latency. The
  app surfaces `outputLatency` in the status line so you can see what
  your stack is costing you.
- **Polyphony max 8 voices.** Hardcoded.
- **Mono mode is retrigger-only.** Last-note priority is implemented;
  legato (no envelope retrigger) is not. Portamento isn't either —
  v2 candidate.
- **Sustain-pedal-only notes** aren't promoted to "in release" for
  voice-stealing purposes — they're held in `MidiInput`, not visible to
  the engine's allocator.
- **Oscillator alias floor** is the polyBLEP-realistic ~−40 dB at A4.
  The §1.1 −80 dB target requires 2× or 4× oversampling on the
  oscillator path; deferred to a v2 polish pass.

## Tech

- **Web**: Vite + React 19 + TypeScript + Tailwind 4.
- **Audio**: Web Audio API. All DSP in TypeScript inside an
  `AudioWorkletProcessor`. Worklet sources bundled by esbuild via a
  small build script (`scripts/build-worklets.mjs`); during dev a
  watcher rebuilds in tens of ms.
- **Desktop**: Tauri 2.x + `tauri-plugin-fs`. JS plugin code is
  dynamically imported so it only loads in Tauri context.
- **Tooling**: pnpm, Vitest (DSP unit + integration), Playwright
  (browser smoke).

## Scripts

```sh
pnpm dev              # Vite + worklet watcher
pnpm build            # bundle worklets, typecheck, vite build
pnpm typecheck        # tsc -b
pnpm test             # vitest run (DSP + state + input)
pnpm test:watch       # vitest in watch mode
pnpm test:e2e         # playwright smoke (auto-starts dev server)
pnpm tauri dev        # Tauri development window
pnpm tauri build      # Tauri release installers
```

First-run for Playwright: `pnpm exec playwright install chromium`.

## Tests

The Vitest suite covers the DSP math directly:

- **polyBLEP saw**: alias-floor measurement at A4/A6, naive comparison.
- **Ladder filter**: stability across an hour-equivalent of fuzzed parameter
  automation, self-oscillation at high resonance, frequency response sanity,
  cutoff sweep without zipper.
- **ADSR**: state-machine transitions, retrigger from release, no NaN over
  long runs.
- **Drift LFO**: depth bounds, smoothness, distinct seeds.
- **Oscillator shapes**: bounds, DC compensation, FM stability.
- **LFO**: shapes, rate, sample-and-hold cycle behavior.
- **Voice allocator**: priority and reassignment logic.
- **Preset persistence**: round-trip, version validation, malformed
  rejection.
- **MIDI parser**: status bytes, sustain pedal deferral, pitch bend.

Playwright covers the integration:

- App boots with the Moog Bass preset.
- Pressing `z` shows `playing: C4` in the readout, releasing returns to
  silent.
- Switching presets updates the selector.
