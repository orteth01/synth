# Digital Moog-Style Synth — Build Plan

**Audience:** Implementing agent
**Goal:** A playable Moog-style monosynth (with optional polyphony) that runs in the browser and as a standalone desktop app from a single codebase. Input via MIDI or computer keyboard.

---

## 1. Project summary

Build a software synthesizer that emulates the sonic character of a Minimoog: three detuned oscillators with antialiased waveshapes, a 24dB/octave resonant ladder lowpass filter with nonlinear saturation, two ADSR envelopes, one LFO, and simple modulation routing. The same code must run as a web app and as a standalone desktop binary on macOS, Windows, and Linux.

This is not a faithful component-level circuit emulation. The target is "sounds convincingly Moog-like to a musician," not "passes a SPICE simulation."

**Platform scope for v1:** desktop browsers (Chromium-based, plus Firefox and desktop Safari on a best-effort basis) and the Tauri desktop app. Mobile browsers are explicitly *not* a target.

## 1.1 Quantitative targets

These turn vibes into tests. Each milestone in §8 should be checked against the relevant ones.

- **MIDI-to-audio latency:** ≤ 15 ms round trip on a typical desktop (measured: input timestamp → first sample of audible output). Tauri must hit this on all three OSes or fall back to Electron per §2.
- **CPU budget:** one voice (3 oscillators + filter + envelopes + LFO, no oversampling on aux paths) under 3% of one core on an M1-class machine at 48 kHz / 128-frame quantum. Eight-voice polyphony under 25%.
- **Alias floor:** for a sawtooth at A4 (440 Hz), no aliased partial above −80 dBFS relative to the fundamental, measured on a 4-second buffer with a Blackman-Harris window.
- **Filter stability:** no NaN, Inf, or sample magnitude > 2.0 across 1 hour of fuzzed parameter automation (cutoff, resonance, drive randomized at audio rate within their declared ranges).
- **Audio dropouts:** zero underruns during a 10-minute stress test that includes UI interaction (dragging knobs, opening/closing the preset menu) at full polyphony.
- **Sample rate / block size:** target 48 kHz, 128-frame render quantum. Code must also run correctly at 44.1 kHz; coefficients are recomputed from `sampleRate` at construction and on rate change.

## 2. Stack

- **UI:** React + TypeScript + Vite. Tailwind for styling.
- **Audio engine:** Web Audio API with a custom `AudioWorkletProcessor` for all DSP. No reliance on built-in `OscillatorNode` or `BiquadFilterNode` for the voice path — those are too clean and don't model the nonlinearities we need.
  - **Parameter binding:** continuous knobs that need smooth, sample-accurate changes (cutoff, resonance, oscillator level, master volume, envelope amount) are exposed as k-rate `AudioParam`s via `parameterDescriptors` on the worklet node. Discrete patch state (waveshape selectors, modulation routing, LFO target, polyphony mode) is sent via `port.postMessage` and read at block boundaries. Note on/off events also go via `postMessage` with a sample-offset timestamp.
- **DSP language (initial):** TypeScript inside the AudioWorklet. If profiling shows we need more headroom (especially for polyphony + oversampling), port the inner loop to Rust → WebAssembly and call it from the worklet. Do not start in Rust; ship working TypeScript first.
- **MIDI:** Web MIDI API (`navigator.requestMIDIAccess`). Works in Chromium-based browsers and inside the desktop wrapper.
- **Desktop wrapper:** Tauri 2.x. Smaller binaries than Electron and the web frontend ports without changes. Electron is acceptable as a fallback if Tauri's audio latency turns out to be problematic on a target platform — verify early.
- **Package manager:** pnpm.
- **Testing:** Vitest for DSP unit tests; Playwright for a smoke test that loads the app and verifies a note can be triggered.
  - DSP unit tests should include: (1) **golden-buffer** tests that render the filter's impulse response at fixed parameter settings and compare against a saved reference within tolerance; (2) **alias-floor** tests that FFT a sustained sawtooth and assert the alias floor target from §1.1; (3) **THD** measurement on the saturator at known input levels; (4) **stability fuzz** that runs the filter for N seconds with randomized parameter automation and asserts no NaN/Inf/clipping > 2.0.

## 3. Repository layout

```
/
├── src/
│   ├── ui/              # React components (knobs, panels, keyboard)
│   ├── audio/
│   │   ├── worklet/     # AudioWorkletProcessor + DSP modules
│   │   ├── engine.ts    # Main-thread wrapper around the AudioContext
│   │   └── voice.ts     # Voice allocation / note management
│   ├── input/
│   │   ├── midi.ts      # Web MIDI handler
│   │   └── keyboard.ts  # Computer keyboard handler
│   └── state/           # Patch state, presets
├── src-tauri/           # Tauri config + Rust shell (mostly empty)
├── tests/
└── public/
```

## 4. DSP design

### 4.1 Oscillators

Three oscillators per voice. Each has:

- Waveshape selector: triangle, sawtooth, square, narrow pulse.
- Coarse tune (±2 octaves, semitone steps) and fine tune (±50 cents).
- Per-oscillator level.
- A small randomized drift LFO (sub-audio, ~0.1 Hz, ±2 cents) added to its pitch. This is non-negotiable — it's most of why the Minimoog sounds "alive" rather than sterile. Each oscillator gets its own independent drift so they beat against each other.

**Antialiasing:** Naive saw/square generation aliases badly. Use **polyBLEP** (polynomial band-limited step) for saw and square. Triangle can be generated by integrating a square. Reference: Välimäki & Huovilainen, "Antialiasing oscillators in subtractive synthesis" (2007).

### 4.2 Mixer and pre-filter saturation

Sum the three oscillators, then apply a soft saturation (`tanh` is fine to start) before the filter input. This models the gain staging of the original — when you turn oscillator levels up past a certain point, the signal compresses and adds harmonics. This is part of the sound, not a defect.

### 4.3 Ladder filter

This is the centerpiece. Implement Antti Huovilainen's nonlinear digital model of the Moog ladder filter (DAFx 2004 paper, "Non-linear digital implementation of the Moog ladder filter"). Key properties to preserve:

- 24 dB/octave lowpass slope.
- Self-oscillation when resonance is pushed to the top.
- Cutoff and resonance smoothly modulatable at audio rate.
- The characteristic gentle compression and harmonic blooming when overdriven.

**Implementation notes:**

- Run the filter at 2× oversampling internally to keep the nonlinearity well-behaved at high cutoffs. Use a simple 2× polyphase IIR or halfband FIR for up/downsampling.
- The standard implementation is four cascaded one-pole lowpass stages with `tanh` nonlinearities and a feedback path scaled by resonance. Open-source references exist in JUCE/Surge/Vital codebases — read them, don't copy verbatim (licenses vary).
- Resonance compensation: as resonance increases, low-frequency content drops. Add a small makeup gain curve so the patch loudness stays roughly stable as the player turns up resonance.

### 4.4 Envelopes and LFO

- Two ADSR envelopes: one for the filter cutoff (with bipolar amount knob), one for amplitude. Use **RC-style asymptotic curves** for attack/decay/release segments — i.e., each segment moves toward its target with a time constant `τ` derived from the knob value, so the curve is `target − (target − current) · exp(-dt/τ)`. Sustain is held linearly. This matches how analog envelopes actually behave; pure linear ramps sound wrong, and "exponential" alone is ambiguous.
- One global LFO: triangle, sine, square, sample-and-hold. Routable to pitch (vibrato), filter cutoff, or amplitude (tremolo). Rate from ~0.05 Hz to ~20 Hz.

### 4.5 Output stage

Final `tanh` soft-clipper before the output gain to prevent harsh digital clipping when the player gets enthusiastic. Then a master volume.

### 4.6 Voice architecture

Start monophonic with last-note priority and legato gliding (portamento knob, 0–2 seconds). This matches the original Minimoog and is simpler.

Once mono works end to end, add a polyphony mode with up to 8 voices. Voice management:

- **Stealing priority:** (1) oldest voice currently in the release stage, (2) otherwise the oldest voice overall.
- **Steal transition:** do not hard-reset oscillator phase or envelope state. Instead, fade the stolen voice's output to zero over ~5 ms before reassigning it, to avoid clicks. The new note begins at sample 0 of the next block after the fade completes.
- **Sustain pedal interaction:** notes held only by the sustain pedal (key already released) count as "in release" for stealing purposes — they're stolen before audibly-decaying notes the player is still holding.
- **Per-voice state:** each voice owns its own oscillator phases, drift LFOs, filter state, and envelope state. The global LFO is shared across voices.

## 5. Input

### 5.1 Computer keyboard

Standard DAW-style mapping over two rows:

- Bottom row `zsxdcvgbhnjm,l.` covers one chromatic octave starting at C.
- Top row `q2w3er5t6y7ui9o0p` covers the octave above.
- `z` / `x` shift octave down/up.

Use `keydown` / `keyup` with a held-keys set so auto-repeat doesn't re-trigger notes. Ignore events when an input field has focus.

### 5.2 MIDI

On startup, request MIDI access and enumerate inputs. Show a dropdown to select which device to listen to (default: first available). Handle:

- Note on / note off (with velocity → amp envelope peak).
- Pitch bend (±2 semitones default, configurable).
- CC 1 (mod wheel) → mod-depth (the LFO's currently selected destination, scaled by the mod-wheel position). Default routing is LFO → pitch, but this is a user choice in the modulation panel rather than hardwired.
- CC 64 (sustain pedal).
- All-notes-off / panic.

Reconnect gracefully when devices are plugged or unplugged (`onstatechange`).

## 6. UI

Front panel laid out left-to-right roughly mirroring a Minimoog: oscillator section, mixer, filter, envelopes, LFO/modulation, output. An on-screen keyboard at the bottom that highlights notes from any input source.

Controls are knobs (rotary, click-and-drag vertically to change, double-click to reset to default, shift-drag for fine adjustment). Use SVG, not canvas — better accessibility, easier theming. Use Pointer Events with `setPointerCapture` on pointerdown so the drag continues correctly when the cursor leaves the knob's bounding box; release on pointerup/pointercancel.

Include a preset selector with a handful of factory presets (bass, lead, pad, FX) and the ability to save/load user presets to `localStorage` on web and to a JSON file in the app data directory on desktop.

**Preset format** is JSON with a top-level `version: 1` field from day one. Loaders must check the version and refuse (or migrate) anything they don't recognize. Treat the schema as additive going forward; never repurpose a field's meaning within a version.

Keep the visual style restrained. No skeuomorphic wood panels unless explicitly requested later.

## 7. Build targets

### Web build
`vite build` produces a static site. Deploy anywhere. The AudioWorklet module must be served with the correct MIME type — Vite handles this in dev but verify in production.

### Desktop build
`tauri build` produces signed installers. The Tauri shell should:

- Open a single window sized for the synth UI (resizable, with sensible minimum dimensions).
- Expose the file system only for preset save/load, scoped to the app data directory.
- Not require any native Rust code beyond the default Tauri scaffold for v1.

Codesigning and notarization are out of scope for v1 — document the unsigned-binary warnings for Mac/Windows users in the README.

## 8. Build order

Do these in order. Don't skip ahead — each step de-risks the next.

1. **Vite + React scaffold.** Empty page with a "play tone" button that starts an `AudioContext` and plays a 440 Hz sine through a placeholder worklet. Confirms the worklet loading pipeline works in dev and prod builds.
2. **One antialiased oscillator** in the worklet, with a saw waveshape. Triggered by the placeholder button.
3. **Computer keyboard input** wired to note on/off, driving oscillator pitch.
4. **Amp ADSR envelope.** Now it sounds like a (very basic) instrument.
5. **Ladder filter** with cutoff and resonance knobs. This is the "now it sounds like a Moog" milestone. Spend time here. A/B against reference recordings. **Acceptance criteria for this step:**
   - Self-oscillation is sustained (not decaying) at resonance ≥ 0.95 of max, with input muted.
   - Cutoff swept from 20 Hz to 20 kHz over 2 seconds produces no audible zipper noise.
   - Filter remains stable (per §1.1 stability target) across 1 hour of fuzzed cutoff/resonance/drive automation.
   - Impulse response at three reference settings (low/mid/high cutoff, fixed Q) matches a saved golden buffer within ±0.5 dB across the band.
6. **Filter ADSR** with envelope amount knob.
7. **Three oscillators** with mix, detune, and drift.
8. **LFO and modulation routing.**
9. **MIDI input.**
10. **Polyphony.**
11. **Preset system.**
12. **Tauri wrapper and desktop build.**
13. **Polish:** UI refinement, factory presets, README, Playwright smoke test.

Each step ends with a working, playable instrument. Don't break that invariant.

## 9. Things that will go wrong (warnings)

- **Audio glitches under UI load.** If the main thread stalls during a React re-render, you'll hear it. The DSP runs on the audio thread so it shouldn't, but parameter updates cross threads. Use `AudioParam` automation where possible rather than posting messages on every knob turn.
- **Filter blow-up.** The nonlinear ladder can go unstable at extreme parameter values, especially at high resonance with audio-rate cutoff modulation. Clamp parameters and put a DC blocker + a final limiter on the output as a safety net.
- **MIDI device permission prompts.** Browsers prompt the first time. Make sure the UI handles the denied case gracefully.
- **Linux audio backend on Tauri.** The default audio path differs across PipeWire / PulseAudio / ALSA configurations and is the most likely place the latency target in §1.1 fails. Measure on a stock Ubuntu LTS as part of the milestone-12 acceptance, not at the end.
- **AudioContext autoplay policy.** Browsers won't start audio until a user gesture. The first click anywhere in the UI should `resume()` the context.

## 10. Out of scope for v1

State here so the agent doesn't drift into them: effects (reverb/delay/chorus), arpeggiator, sequencer, sample import, multi-timbral operation, microtonal tuning, MPE, VST/AU plugin export, mobile-optimized UI, accessibility audit beyond basic keyboard navigation. All of these are reasonable v2 candidates.

## 11. Definition of done for v1

- A musician can open the web app or desktop app, plug in a MIDI keyboard (or use the computer keyboard), and play it without reading documentation.
- The default patch sounds recognizably like a Moog bass.
- All 11 build-order steps are complete.
- The README explains installation, MIDI setup, and known limitations.
- The Playwright smoke test passes in CI.
