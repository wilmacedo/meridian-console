import { defaultVoicePrefs, type VoicePrefs } from './voice-prefs'

// Kept apart from the other workspace prefs: the player and the microphone read it, and prefs.svelte pulls in the
// live stream, which pulls in the player.
export const voicePrefs = $state<VoicePrefs>(defaultVoicePrefs(false))

export function applyAudioSession(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session && voicePrefs.audioSession !== 'auto') session.type = voicePrefs.audioSession
}
