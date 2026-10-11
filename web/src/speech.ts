/**
 * Spoken steps with the browser's speechSynthesis (TTS_PROVIDER=browser, the default).
 *
 * Chrome only allows speech after a user gesture, so `unlock()` is called from the
 * "Start painting" tap.
 *
 * Pause/resume: `speechSynthesis.pause()` is unreliable on Android Chrome (it often
 * stops for good), so text is spoken as a queue of sentences. Pausing cancels speech
 * and remembers the sentence that was playing; resuming starts again from the start
 * of that sentence. This behaves the same on every platform.
 */

export type SpeechState = 'idle' | 'speaking' | 'paused'

/** The parts of the Web Speech API the speaker uses (a fake in tests). */
export interface Synth {
  speak(u: SpeechSynthesisUtterance): void
  cancel(): void
  getVoices(): SpeechSynthesisVoice[]
}

/** Split text into sentences, keeping the punctuation. */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? []
  return parts.map((p) => p.trim()).filter(Boolean)
}

export class Speaker {
  private sentences: string[] = []
  private index = 0
  private generation = 0
  private state: SpeechState = 'idle'
  private readonly listeners = new Set<(s: SpeechState) => void>()
  private readonly synth: Synth
  private readonly makeUtterance: (text: string) => SpeechSynthesisUtterance

  constructor(synth: Synth, makeUtterance: (text: string) => SpeechSynthesisUtterance) {
    this.synth = synth
    this.makeUtterance = makeUtterance
  }

  get current(): SpeechState {
    return this.state
  }

  /** Subscribe to state changes; returns an unsubscribe function. */
  onChange(fn: (s: SpeechState) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private setState(next: SpeechState): void {
    if (next === this.state) return
    this.state = next
    for (const fn of this.listeners) fn(next)
  }

  private voice(): SpeechSynthesisVoice | undefined {
    const voices = this.synth.getVoices()
    return voices.find((v) => v.lang.startsWith('en') && v.localService) ?? voices.find((v) => v.lang.startsWith('en'))
  }

  /** Queue sentences from `start`. Callbacks from an older generation are ignored. */
  private speakFrom(start: number): void {
    const gen = ++this.generation
    this.synth.cancel()
    if (start >= this.sentences.length) {
      this.setState('idle')
      return
    }
    const voice = this.voice()
    for (let i = start; i < this.sentences.length; i++) {
      const u = this.makeUtterance(this.sentences[i])
      if (voice) u.voice = voice
      u.lang = voice?.lang ?? 'en-US'
      u.rate = 0.95
      u.onstart = () => {
        if (gen === this.generation) this.index = i
      }
      if (i === this.sentences.length - 1) {
        u.onend = () => {
          if (gen === this.generation) this.setState('idle')
        }
      }
      u.onerror = () => {
        // "interrupted"/"canceled" come from our own cancel(); anything else ends the queue.
        if (gen === this.generation) this.setState('idle')
      }
      this.synth.speak(u)
    }
    this.index = start
    this.setState('speaking')
  }

  /** Speak `text` from the beginning, interrupting anything already playing or paused. */
  speak(text: string): void {
    this.sentences = splitSentences(text)
    this.speakFrom(0)
  }

  /** Pause: stop now, remember the current sentence. */
  pause(): void {
    if (this.state !== 'speaking') return
    this.generation++
    this.synth.cancel()
    this.setState('paused')
  }

  /** Resume from the start of the sentence that was playing. */
  resume(): void {
    if (this.state !== 'paused') return
    this.speakFrom(this.index)
  }

  /** Pause if speaking, resume if paused. */
  toggle(): void {
    if (this.state === 'speaking') this.pause()
    else if (this.state === 'paused') this.resume()
  }

  stop(): void {
    this.generation++
    this.synth.cancel()
    this.sentences = []
    this.index = 0
    this.setState('idle')
  }
}

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

let speaker: Speaker | null = null
let unlocked = false

/** The app-wide speaker (null where speechSynthesis doesn't exist). */
export function getSpeaker(): Speaker | null {
  if (!speechAvailable()) return null
  speaker ??= new Speaker(window.speechSynthesis, (text) => new SpeechSynthesisUtterance(text))
  return speaker
}

/** Call inside a tap handler: speaks a silent utterance so later auto-play is allowed. */
export function unlock(): void {
  if (!speechAvailable() || unlocked) return
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  speechSynthesis.speak(u)
  unlocked = true
}

/** Speak `text`, interrupting anything already playing. */
export function speak(text: string): void {
  getSpeaker()?.speak(text)
}

export function stopSpeaking(): void {
  getSpeaker()?.stop()
}
