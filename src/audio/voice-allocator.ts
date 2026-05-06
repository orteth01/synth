export interface VoiceTracker {
  state: 'free' | 'playing' | 'releasing'
  note: number | null
  noteOnSeq: number
  noteOffSeq: number
}

export interface AllocateResult {
  voiceIndex: number
  /** The note that was previously assigned to this voice, if any (i.e. the
   * note that's being stolen). Caller should drop that note from its tracking. */
  stolenNote: number | null
}

/** Voice allocator implementing the priority from plan §4.6:
 *  (1) free voice → (2) oldest releasing voice → (3) oldest playing voice. */
export class VoiceAllocator {
  private trackers: VoiceTracker[]
  private maxActive: number
  private seq = 0

  constructor(numVoices: number, maxActive: number) {
    this.trackers = []
    for (let i = 0; i < numVoices; i++) {
      this.trackers.push({ state: 'free', note: null, noteOnSeq: 0, noteOffSeq: 0 })
    }
    this.maxActive = Math.max(1, Math.min(numVoices, maxActive))
  }

  setMaxActive(n: number): void {
    this.maxActive = Math.max(1, Math.min(this.trackers.length, n))
  }

  getMaxActive(): number {
    return this.maxActive
  }

  allocate(note: number): AllocateResult {
    const limit = this.maxActive
    let target = -1
    let stolen: number | null = null

    for (let i = 0; i < limit; i++) {
      if (this.trackers[i].state === 'free') {
        target = i
        break
      }
    }

    if (target === -1) {
      let oldest = -1
      let oldestSeq = Number.POSITIVE_INFINITY
      for (let i = 0; i < limit; i++) {
        const t = this.trackers[i]
        if (t.state === 'releasing' && t.noteOffSeq < oldestSeq) {
          oldestSeq = t.noteOffSeq
          oldest = i
        }
      }
      if (oldest !== -1) target = oldest
    }

    if (target === -1) {
      let oldest = 0
      let oldestSeq = this.trackers[0].noteOnSeq
      for (let i = 1; i < limit; i++) {
        if (this.trackers[i].noteOnSeq < oldestSeq) {
          oldestSeq = this.trackers[i].noteOnSeq
          oldest = i
        }
      }
      target = oldest
    }

    const t = this.trackers[target]
    if (t.state !== 'free' && t.note !== null) {
      stolen = t.note
    }
    t.state = 'playing'
    t.note = note
    t.noteOnSeq = ++this.seq
    t.noteOffSeq = 0
    return { voiceIndex: target, stolenNote: stolen }
  }

  /** Mark the voice playing this note as releasing. Returns the voice index
   *  or -1 if the note isn't currently mapped to any voice. */
  release(note: number): number {
    for (let i = 0; i < this.trackers.length; i++) {
      const t = this.trackers[i]
      if (t.state === 'playing' && t.note === note) {
        t.state = 'releasing'
        t.noteOffSeq = ++this.seq
        return i
      }
    }
    return -1
  }

  /** Reassign a still-playing voice slot to a new note (no envelope retrigger
   *  required at the allocator level — the engine decides). Used by mono mode
   *  when falling back to a held note. */
  reassign(voiceIndex: number, newNote: number): number | null {
    const t = this.trackers[voiceIndex]
    const stolen = t.state !== 'free' ? t.note : null
    t.state = 'playing'
    t.note = newNote
    t.noteOnSeq = ++this.seq
    t.noteOffSeq = 0
    return stolen
  }

  /** Mark a releasing/playing voice as free (called when its envelope finishes). */
  free(voiceIndex: number): void {
    const t = this.trackers[voiceIndex]
    t.state = 'free'
    t.note = null
  }

  freeAll(): void {
    for (const t of this.trackers) {
      t.state = 'free'
      t.note = null
      t.noteOnSeq = 0
      t.noteOffSeq = 0
    }
    this.seq = 0
  }

  voiceForNote(note: number): number {
    for (let i = 0; i < this.trackers.length; i++) {
      if (this.trackers[i].state !== 'free' && this.trackers[i].note === note) return i
    }
    return -1
  }

  snapshot(): ReadonlyArray<VoiceTracker> {
    return this.trackers
  }
}
