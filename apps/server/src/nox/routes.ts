import type { FastifyInstance, FastifyReply } from 'fastify'
import type { EventBus } from '../event-bus.js'
import type { ScreenRegistry } from '../screens.js'
import type { Registry } from '../service-registry.js'
import { usage, voiceConfig } from '../voice/elevenlabs.js'
import { playbackDone, waitForPlayback } from '../voice/playback.js'
import { TurnSpeaker } from '../voice/speaker.js'
import { keytermsFor, transcribe } from '../voice/transcribe.js'
import { spokenAnswer, type Approvals } from './approvals.js'
import { commandNote, type Nox } from './process.js'

const MAX_UTTERANCE = 2000
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
// A screen that never reports it finished playing must not keep NOX "speaking" forever.
const PLAYBACK_TIMEOUT_MS = 90_000

let turns = 0

interface Deps {
  nox: Nox
  bus: EventBus
  screens: ScreenRegistry
  registry: Registry
  approvals: Approvals
}

// The entry points to NOX. Both answer as newline-delimited JSON events (text, tool, done, error); when
// voice is configured and a screen is showing the workspace, the answer is also spoken there, sentence
// by sentence, while it is still being written.
export function registerNox(app: FastifyInstance, { nox, bus, screens, registry, approvals }: Deps): void {
  async function answer(text: string, workspace: string, reply: FastifyReply, heardLine?: string): Promise<void> {
    bus.emit('nox', 'info', `request: ${text.slice(0, 120)}`)
    reply.hijack()
    reply.raw.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' })
    if (heardLine) reply.raw.write(`${JSON.stringify({ type: 'heard', text: heardLine })}\n`)

    const turn = ++turns
    const voice = voiceConfig()
    let spent = 0
    let spoke = false
    const speaker =
      voice && (screens.counts()[workspace] ?? 0) > 0
        ? new TurnSpeaker(voice, turn, {
            send: (message) => screens.sendTo(workspace, message),
            onFirstAudio: () => {
              spoke = true
              screens.setAgentMode('speaking')
            },
            onError: (message) => bus.emit('nox', 'error', `voice: ${message}`),
            onSpent: (chars) => (spent += chars),
          })
        : undefined

    screens.setAgentMode('thinking')
    let typing = false
    try {
      for await (const event of nox.say(text, workspace)) {
        if (event.type === 'text') {
          if (speaker) speaker.push(event.text)
          else if (!typing) {
            typing = true
            screens.setAgentMode('speaking')
          }
        }
        if (event.type === 'tool') speaker?.flush()
        if (event.type === 'command') bus.emit('nox', 'info', commandNote(event.command))
        if (event.type === 'error') bus.emit('nox', 'error', event.message)
        reply.raw.write(`${JSON.stringify(event)}\n`)
      }
      // The text is complete: the caller has its answer, and the speech carries on after this.
      reply.raw.end()
      if (speaker) {
        // Listen for the screen's "done" before the last sentence can possibly reach it.
        const played = waitForPlayback(turn, PLAYBACK_TIMEOUT_MS)
        await speaker.finish()
        if (!spoke) playbackDone(turn)
        await played
      }
    } finally {
      screens.setAgentMode('idle')
      if (!reply.raw.writableEnded) reply.raw.end()
    }

    if (voice && spent > 0) {
      usage(voice).then(
        (u) => bus.emit('nox', 'info', `voice: ${u.used} of ${u.limit} characters used this period`),
        () => undefined,
      )
    }
  }

  // Text in: the dev CLI.
  app.post<{ Body: { text: string; workspace?: string } }>(
    '/api/nox/say',
    { schema: { body: { type: 'object', required: ['text'], properties: { text: { type: 'string', minLength: 1, maxLength: MAX_UTTERANCE }, workspace: { type: 'string' } } } } },
    async (request, reply) => answer(request.body.text, request.body.workspace ?? 'default', reply),
  )

  // A recording in: transcribed first, with the service names as hints, then answered like any other
  // request. The first line of the stream tells the caller what was heard.
  app.addContentTypeParser(/^audio\/.*/, { parseAs: 'buffer', bodyLimit: MAX_AUDIO_BYTES }, (_request, body, done) => done(null, body))
  app.post<{ Querystring: { workspace?: string } }>('/api/voice/ask', async (request, reply) => {
    const voice = voiceConfig()
    if (!voice) return reply.code(503).send({ error: 'voice is not configured (ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID)' })
    const audio = request.body as Buffer
    if (!Buffer.isBuffer(audio) || audio.length === 0) return reply.code(400).send({ error: 'send the recording as the request body' })

    let heard: string
    try {
      const names = registry.summaries().flatMap((s) => [s.id, s.name])
      heard = await transcribe(voice, audio, request.headers['content-type'] ?? 'audio/webm', keytermsFor(names))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'transcription failed'
      bus.emit('nox', 'error', `voice: ${message}`)
      return reply.code(502).send({ error: message })
    }
    if (!heard) return reply.code(422).send({ error: 'nothing heard' })
    // NOX is waiting on a card: what was said is the owner's answer to it, not a new request.
    const workspace = request.query.workspace ?? 'default'
    if (approvals.has(workspace)) {
      const allow = spokenAnswer(heard)
      if (allow !== undefined) approvals.answerLatest(workspace, allow)
      return reply.send({ heard, answeredCard: allow !== undefined })
    }
    return answer(heard, workspace, reply, heard)
  })
}
