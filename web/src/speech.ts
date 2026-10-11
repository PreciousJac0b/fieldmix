/**
 * Spoken steps with the browser's speechSynthesis (TTS_PROVIDER=browser, the default).
 * Chrome only allows speech after a user gesture, so `unlock()` is called from the
 * "Start painting" tap.
 */

let unlocked = false

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function englishVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices()
  return voices.find((v) => v.lang.startsWith('en') && v.localService) ?? voices.find((v) => v.lang.startsWith('en'))
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
  if (!speechAvailable()) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voice = englishVoice()
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'en-US'
  u.rate = 0.95
  speechSynthesis.speak(u)
}

export function stopSpeaking(): void {
  if (speechAvailable()) speechSynthesis.cancel()
}
