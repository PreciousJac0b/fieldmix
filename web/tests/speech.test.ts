import { describe, expect, it } from 'vitest'
import { Speaker, splitSentences, type SpeechState, type Synth } from '../src/speech.ts'

/** A fake utterance with the event hooks the speaker sets. */
class FakeUtterance {
  text: string
  voice: SpeechSynthesisVoice | null = null
  lang = ''
  rate = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

/** A fake engine: keeps a queue, and cancel() fires onerror on everything queued (like Chrome). */
class FakeSynth implements Synth {
  queue: FakeUtterance[] = []
  spoken: string[] = []
  cancels = 0
  speak(u: SpeechSynthesisUtterance): void {
    this.queue.push(u as unknown as FakeUtterance)
  }
  cancel(): void {
    this.cancels++
    const dropped = this.queue
    this.queue = []
    for (const u of dropped) u.onerror?.()
  }
  getVoices(): SpeechSynthesisVoice[] {
    return []
  }
  /** Play the next queued sentence to completion. */
  playNext(): void {
    const u = this.queue.shift()
    if (!u) return
    u.onstart?.()
    this.spoken.push(u.text)
    u.onend?.()
  }
  /** Start the next sentence but don't finish it (it's mid-sentence). */
  startNext(): void {
    this.queue[0]?.onstart?.()
  }
}

function setup() {
  const synth = new FakeSynth()
  const speaker = new Speaker(synth, (t) => new FakeUtterance(t) as unknown as SpeechSynthesisUtterance)
  const states: SpeechState[] = []
  speaker.onChange((st) => states.push(st))
  return { synth, speaker, states }
}

const TEXT = 'Step 1. Paint the sky. For the sky, start with 3 parts Titanium White, 1 part Ultramarine Blue. Use a big brush.'

describe('splitSentences', () => {
  it('splits on sentence punctuation and keeps it', () => {
    expect(splitSentences(TEXT)).toEqual([
      'Step 1.',
      'Paint the sky.',
      'For the sky, start with 3 parts Titanium White, 1 part Ultramarine Blue.',
      'Use a big brush.',
    ])
  })
  it('keeps text without final punctuation and ignores empty input', () => {
    expect(splitSentences('Mix it! Then wait')).toEqual(['Mix it!', 'Then wait'])
    expect(splitSentences('   ')).toEqual([])
  })
})

describe('Speaker pause and resume', () => {
  it('queues every sentence and reports speaking, then idle at the end', () => {
    const { synth, speaker, states } = setup()
    speaker.speak(TEXT)
    expect(synth.queue.map((u) => u.text)).toHaveLength(4)
    expect(speaker.current).toBe('speaking')
    for (let i = 0; i < 4; i++) synth.playNext()
    expect(speaker.current).toBe('idle')
    expect(states).toEqual(['speaking', 'idle'])
  })

  it('pause stops speech immediately and stays paused (cancel errors are ignored)', () => {
    const { synth, speaker } = setup()
    speaker.speak(TEXT)
    synth.playNext() // "Step 1."
    synth.startNext() // mid "Paint the sky."
    speaker.pause()
    expect(speaker.current).toBe('paused')
    expect(synth.queue).toHaveLength(0)
  })

  it('resume restarts from the beginning of the interrupted sentence', () => {
    const { synth, speaker } = setup()
    speaker.speak(TEXT)
    synth.playNext()
    synth.startNext() // interrupted during sentence 2
    speaker.pause()
    speaker.resume()
    expect(speaker.current).toBe('speaking')
    expect(synth.queue.map((u) => u.text)).toEqual(splitSentences(TEXT).slice(1))
    while (synth.queue.length) synth.playNext()
    expect(speaker.current).toBe('idle')
    expect(synth.spoken).toEqual(splitSentences(TEXT)) // nothing skipped, nothing repeated twice in full
  })

  it('toggle alternates pause and resume, and does nothing when idle', () => {
    const { synth, speaker } = setup()
    speaker.toggle()
    expect(speaker.current).toBe('idle')
    speaker.speak(TEXT)
    speaker.toggle()
    expect(speaker.current).toBe('paused')
    speaker.toggle()
    expect(speaker.current).toBe('speaking')
    expect(synth.queue).toHaveLength(4)
  })

  it('speaking new text while paused starts the new text from the top', () => {
    const { synth, speaker } = setup()
    speaker.speak(TEXT)
    synth.playNext()
    speaker.pause()
    speaker.speak('Add one more part of Titanium White. Dab again.')
    expect(speaker.current).toBe('speaking')
    expect(synth.queue.map((u) => u.text)).toEqual(['Add one more part of Titanium White.', 'Dab again.'])
  })

  it('stop clears everything and resume after stop does nothing', () => {
    const { synth, speaker } = setup()
    speaker.speak(TEXT)
    speaker.stop()
    expect(speaker.current).toBe('idle')
    speaker.resume()
    expect(synth.queue).toHaveLength(0)
  })

  it('pausing during the last sentence and resuming replays just that sentence', () => {
    const { synth, speaker } = setup()
    speaker.speak(TEXT)
    for (let i = 0; i < 3; i++) synth.playNext()
    synth.startNext()
    speaker.pause()
    speaker.resume()
    expect(synth.queue.map((u) => u.text)).toEqual(['Use a big brush.'])
  })
})
