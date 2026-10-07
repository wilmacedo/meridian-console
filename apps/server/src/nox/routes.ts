import type { FastifyInstance } from 'fastify'
import type { EventBus } from '../event-bus.js'
import type { ScreenRegistry } from '../screens.js'
import { usage, voiceConfig } from '../voice/elevenlabs.js'
import { playbackDone, waitForPlayback } from '../voice/playback.js'
import { TurnSpeaker } from '../voice/speaker.js'
import type { Nox } from './process.js'

const MAX_UTTERANCE = 2000
// A screen that never reports it finished playing must not keep NOX "speaking" forever.
const PLAYBACK_TIMEOUT_MS = 90_000

let turns = 0

// The one entry point to NOX: voice posts here, and so does the dev CLI. The answer streams back as
// newline-delimited JSON events (text, tool, done, error); when voice is configured and a screen is
// showing the workspace, it is also spoken there, sentence by sentence.
export function registerNox(app: FastifyInstance, nox: Nox, bus: EventBus, screens: ScreenRegistry): void {
  app.post<{ Body: { text: string; workspace?: string } }>(
    '/api/nox/say',
    { schema: { body: { type: 'object', required: ['text'], properties: { text: { type: 'string', minLength: 1, maxLength: MAX_UTTERANCE }, workspace: { type: 'string' } } } } },
    async (request, reply) => {
      const { text, workspace = 'default' } = request.body
      bus.emit('nox', 'info', `request: ${text.slice(0, 120)}`)
      reply.hijack()
      reply.raw.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' })

      const turn = ++turns
      const voice = voiceConfig()
      let spent = 0
      let heard = false
      const speaker =
        voice && (screens.counts()[workspace] ?? 0) > 0
          ? new TurnSpeaker(voice, turn, {
              send: (message) => screens.sendTo(workspace, message),
              onFirstAudio: () => {
                heard = true
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
          if (event.type === 'error') bus.emit('nox', 'error', event.message)
          reply.raw.write(`${JSON.stringify(event)}\n`)
        }
        // The text is complete: the caller has its answer, and the speech carries on after this.
        reply.raw.end()
        if (speaker) {
          // Listen for the screen's "done" before the last sentence can possibly reach it.
          const played = waitForPlayback(turn, PLAYBACK_TIMEOUT_MS)
          await speaker.finish()
          if (!heard) playbackDone(turn)
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
    },
  )
}
