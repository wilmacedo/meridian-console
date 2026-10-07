import type { StreamMessage } from '@meridian/service-sdk'
import { synthesize, type VoiceConfig } from './elevenlabs.js'
import { SentenceSplitter } from './sentences.js'

interface Hooks {
  // Delivers a message to the screen that is listening; false when there is none.
  send: (message: StreamMessage) => boolean
  onFirstAudio: () => void
  onError: (message: string) => void
  // Characters sent to the TTS, for the usage counter.
  onSpent: (chars: number) => void
}

// Turns one NOX answer into speech while it is still being written: each finished sentence goes to the
// TTS at once, and the audio is delivered in order as soon as it is ready.
export class TurnSpeaker {
  private splitter = new SentenceSplitter()
  private seq = 0
  private chain: Promise<void> = Promise.resolve()
  private started = false

  constructor(
    private config: VoiceConfig,
    private turn: number,
    private hooks: Hooks,
  ) {}

  push(delta: string): void {
    for (const sentence of this.splitter.push(delta)) this.speak(sentence)
  }

  // Speaks what has not formed a sentence yet. NOX does this before it acts, because the tool call can
  // wait on the owner (a confirmation card) and what it said before must not be heard after the wait.
  flush(): void {
    const rest = this.splitter.flush()
    if (rest) this.speak(rest)
  }

  // Speaks what is left and resolves once every sentence has been delivered.
  async finish(): Promise<void> {
    this.flush()
    await this.chain
    this.hooks.send({ type: 'speech_end', turn: this.turn })
  }

  private speak(sentence: string): void {
    this.hooks.onSpent(sentence.length)
    // Synthesis starts now; delivery waits its turn so the sentences stay in order.
    const audio = synthesize(this.config, sentence)
    const seq = this.seq++
    this.chain = this.chain.then(async () => {
      try {
        const mp3 = await audio
        if (!this.started) {
          this.started = true
          this.hooks.onFirstAudio()
        }
        this.hooks.send({ type: 'speech', turn: this.turn, seq, mime: 'audio/mpeg', audio: mp3.toString('base64') })
      } catch (err) {
        this.hooks.onError(err instanceof Error ? err.message : 'speech synthesis failed')
      }
    })
  }
}
