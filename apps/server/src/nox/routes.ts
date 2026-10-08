import type { FastifyInstance, FastifyReply } from 'fastify'
import type { EventBus } from '../event-bus.js'
import type { ScreenRegistry } from '../screens.js'
import type { Registry } from '../service-registry.js'
import { usage, voiceConfig } from '../voice/elevenlabs.js'
import { playbackDone, waitForPlayback } from '../voice/playback.js'
import { TurnSpeaker } from '../voice/speaker.js'
import { isSpeech, keytermsFor, transcribe } from '../voice/transcribe.js'
import type { VoiceMessages } from '../voice/voice-messages.js'
import { afterWakeWord, wakeConfig } from '../voice/wake-word.js'
import { isSlowTool, pickAck } from './acknowledge.js'
import { spokenAnswer, type Approvals } from './approvals.js'
import { commandNote, type Nox } from './process.js'

const MAX_UTTERANCE = 2000
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
// A screen that never reports it finished playing must not keep NOX "speaking" forever.
const PLAYBACK_TIMEOUT_MS = 90_000
// How long a spoken update waits for the owner's own turn to end before it goes ahead anyway.
const ANNOUNCE_WAIT_MS = 5 * 60_000
// A recorded message that was not sent (declined, failed) stays this long, so "manda de novo" still finds it.
const UNSENT_MESSAGE_MS = 2 * 60_000
const STALE_MESSAGE_MS = 10 * 60_000

// Numbers each answer so a screen can tell one turn's speech from another's. It starts from the clock, not
// from zero: a screen that stayed open across a server restart still remembers the last turn it played,
// and would drop every new answer as an old one.
let turns = Date.now()

// Where a turn's events are written: an HTTP response, or nowhere for a turn NOX starts itself.
interface Sink {
  write: (chunk: string) => unknown
  end: () => unknown
  readonly writableEnded: boolean
}

interface Deps {
  nox: Nox
  bus: EventBus
  screens: ScreenRegistry
  registry: Registry
  approvals: Approvals
  messages: VoiceMessages
  wakeDir: string
}

// What NOX is told in place of a transcript when the owner records the message it asked for. It has not heard
// the audio, and the owner's spoken request is what authorizes sending it.
export const recordedMessageNote = (to: string, path: string): string =>
  `[voice message recorded] The owner has just recorded, in their own voice, the message for ${to} that you asked them to record. It is the audio file ${path}. ` +
  'Send it now as they asked (for WhatsApp, send-voice with this path), so the owner confirms on the screen. You have not heard it: do not guess or describe what it says. ' +
  'Once it is sent, say only that it was sent and call end_conversation; if it was not, say so in one sentence.'

// The entry points to NOX. Both answer as newline-delimited JSON events (text, tool, done, error); when
// voice is configured and a screen is showing the workspace, the answer is also spoken there, sentence
// by sentence, while it is still being written.
export function registerNox(app: FastifyInstance, { nox, bus, screens, registry, approvals, messages, wakeDir }: Deps): { interrupt: () => void; announce: (text: string, workspace: string, screen?: string) => void } {
  // The turn whose answer is being written or spoken, for the owner to cut off.
  let active: { turn: number; speaker?: TurnSpeaker } | undefined

  // The owner talks over NOX: end the turn that is running, stop synthesising, and release the screen
  // (which has already stopped playing) so the next request starts clean.
  function interrupt(): void {
    nox.interrupt()
    approvals.denyTurn('interrupted')
    messages.disarm()
    if (!active) return
    active.speaker?.cancel()
    playbackDone(active.turn)
  }

  async function answer(text: string, workspace: string, reply: FastifyReply, heardLine?: string, screen?: string): Promise<void> {
    bus.emit('nox', 'info', `request: ${text.slice(0, 120)}`)
    reply.hijack()
    reply.raw.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' })
    if (heardLine) reply.raw.write(`${JSON.stringify({ type: 'heard', text: heardLine })}\n`)
    await run(text, workspace, reply.raw, screen)
  }

  // One turn of NOX, written to `out` as it goes and spoken on the screens of the workspace.
  async function run(text: string, workspace: string, out: Sink, screen?: string): Promise<void> {
    const turn = ++turns
    const voice = voiceConfig()
    let spent = 0
    let spoke = false
    const speaker =
      voice && (screens.counts()[workspace] ?? 0) > 0
        ? new TurnSpeaker(voice, turn, {
            send: (message) => screens.sendTo(workspace, message, screen),
            onFirstAudio: () => {
              spoke = true
              screens.setAgentMode('speaking')
            },
            onError: (message) => bus.emit('nox', 'error', `voice: ${message}`),
            onSpent: (chars) => (spent += chars),
          })
        : undefined

    active = { turn, speaker }
    screens.setAgentMode('thinking')
    let typing = false
    let saidSomething = false
    try {
      for await (const event of nox.say(text, workspace, screen)) {
        if (event.type === 'text') {
          saidSomething = true
          if (speaker) speaker.push(event.text)
          else if (!typing) {
            typing = true
            screens.setAgentMode('speaking')
          }
        }
        if (event.type === 'tool') {
          // Slow work and not a word yet: say that it was understood, rather than leave the owner in silence.
          if (!saidSomething && isSlowTool(event.name)) {
            saidSomething = true
            speaker?.say(pickAck())
          }
          speaker?.flush()
        }
        if (event.type === 'command') bus.emit('nox', 'info', commandNote(event.command))
        if (event.type === 'error') bus.emit('nox', 'error', event.message)
        out.write(`${JSON.stringify(event)}\n`)
      }
      // The text is complete: the caller has its answer, and the speech carries on after this.
      out.end()
      if (speaker) {
        // Listen for the screen's "done" before the last sentence can possibly reach it.
        const played = waitForPlayback(turn, PLAYBACK_TIMEOUT_MS)
        await speaker.finish()
        if (!spoke) playbackDone(turn)
        await played
      }
    } finally {
      if (active?.turn === turn) active = undefined
      screens.setAgentMode('idle')
      if (!out.writableEnded) out.end()
    }

    if (voice && spent > 0) {
      usage(voice).then(
        (u) => bus.emit('nox', 'info', `voice: ${u.used} of ${u.limit} characters used this period`),
        () => undefined,
      )
    }
  }

  // Text in: the dev CLI.
  app.post<{ Body: { text: string; workspace?: string; screen?: string } }>(
    '/api/nox/say',
    { schema: { body: { type: 'object', required: ['text'], properties: { text: { type: 'string', minLength: 1, maxLength: MAX_UTTERANCE }, workspace: { type: 'string' }, screen: { type: 'string' } } } } },
    async (request, reply) => answer(request.body.text, request.body.workspace ?? 'default', reply, undefined, request.body.screen),
  )

  // A recording in: transcribed first, with the service names as hints, then answered like any other
  // request. The first line of the stream tells the caller what was heard.
  app.addContentTypeParser(/^audio\/.*/, { parseAs: 'buffer', bodyLimit: MAX_AUDIO_BYTES }, (_request, body, done) => done(null, body))
  app.post<{ Querystring: { workspace?: string; screen?: string; noise?: string; capture?: string; wake?: string } }>('/api/voice/ask', async (request, reply) => {
    const voice = voiceConfig()
    if (!voice) return reply.code(503).send({ error: 'voice is not configured (ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID)' })
    const audio = request.body as Buffer
    if (!Buffer.isBuffer(audio) || audio.length === 0) return reply.code(400).send({ error: 'send the recording as the request body' })
    const workspace = request.query.workspace ?? 'default'

    // NOX asked for a message to send, and the screen recorded it as one (both must agree, so a later tap on the
    // mic is never mistaken for it): the recording is the owner's voice to pass on, never transcribed or obeyed.
    // One recorded as a message that nobody waits for any more (expired, interrupted, a retry of one that already
    // got through) is dropped, never taken for a request.
    const to = messages.take(workspace)
    if (request.query.capture === '1') {
      if (to === undefined || approvals.has(workspace)) {
        bus.emit('nox', 'warn', 'voice: a recorded message arrived when none was awaited, dropped')
        return reply.code(409).send({ error: 'no message was asked for' })
      }
      const path = await messages.save(audio, request.headers['content-type'] ?? 'audio/webm')
      bus.emit('nox', 'info', `voice message recorded for ${to}`)
      try {
        await answer(recordedMessageNote(to, path), workspace, reply, undefined, request.query.screen)
      } finally {
        messages.removeLater(path, UNSENT_MESSAGE_MS)
      }
      return
    }

    // A recording the wake word started begins with the word: the transcript has to have it, or the listener woke to
    // something else. Checking costs nothing, since the recording is transcribed anyway.
    const wake = request.query.wake === '1' ? wakeConfig(wakeDir) : undefined
    let heard: string
    try {
      const names = registry.summaries().flatMap((s) => [s.id, s.name])
      const result = await transcribe(voice, audio, request.headers['content-type'] ?? 'audio/webm', keytermsFor([...names, ...(wake ? [wake.phrase] : [])]))
      // Only a screen that asks for it (the car) is strict: elsewhere anything with a word in it is answered.
      if (!isSpeech(result, request.query.noise === 'strict' ? 'strict' : 'normal')) return reply.code(422).send({ error: 'nothing heard' })
      heard = result.text
    } catch (err) {
      const message = err instanceof Error ? err.message : 'transcription failed'
      bus.emit('nox', 'error', `voice: ${message}`)
      return reply.code(502).send({ error: message })
    }
    if (wake) {
      const asked = afterWakeWord(heard, wake.heard)
      if (asked === undefined) {
        bus.emit('nox', 'info', 'voice: woke without the wake word in the recording')
        return reply.code(422).send({ error: 'no wake word' })
      }
      heard = asked
    }
    if (!heard) return reply.code(422).send({ error: 'nothing heard' })
    // The owner gave up while it was being transcribed: a request nobody is waiting for is not run.
    if (request.socket.destroyed) return
    // NOX is waiting on a card: what was said is the owner's answer to it, not a new request.
    if (approvals.has(workspace)) {
      const allow = spokenAnswer(heard)
      if (allow !== undefined) approvals.answerLatest(workspace, allow)
      return reply.send({ heard, answeredCard: allow !== undefined })
    }
    return answer(heard, workspace, reply, heard, request.query.screen)
  })

  void messages.sweep(STALE_MESSAGE_MS)
  setInterval(() => void messages.sweep(STALE_MESSAGE_MS), STALE_MESSAGE_MS).unref()

  // NOX speaks first: something it was waiting for happened (an agent finished). It waits for the owner's own
  // turn to end, and its text goes nowhere but the screens of the workspace.
  let announcing: Promise<void> = Promise.resolve()
  function announce(text: string, workspace: string, screen?: string): void {
    announcing = announcing.then(async () => {
      for (let waited = 0; active && waited < ANNOUNCE_WAIT_MS; waited += 500) await new Promise((resolve) => setTimeout(resolve, 500))
      bus.emit('nox', 'info', `update: ${text.slice(0, 120)}`)
      const sink = { write: () => true, end: () => undefined, writableEnded: false }
      await run(text, workspace, sink, screen).catch((err: unknown) => bus.emit('nox', 'error', `announce: ${err instanceof Error ? err.message : 'failed'}`))
    })
  }

  return { interrupt, announce }
}
