import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { dataDir } from '../database.js'

// The wake word's models live on this host, not in the repository: they are trained for this owner (and the ready-made
// ones openWakeWord publishes are not licensed for redistribution). `wake.json` names the phrase and how the
// transcription writes it.
export const wakeDir = (): string => process.env.MERIDIAN_WAKE_DIR || join(dataDir(), 'wake')

export const WAKE_FILES = ['melspectrogram.onnx', 'embedding_model.onnx', 'wake.onnx'] as const

export interface WakeConfig {
  // What the owner says, as the settings show it.
  phrase: string
  // How the transcription may write it, in any case and with or without accents ("nox", "nóx", "knox").
  heard: string[]
}

export function wakeConfig(dir: string): WakeConfig | undefined {
  if (!WAKE_FILES.every((f) => existsSync(join(dir, f)))) return undefined
  try {
    const config = JSON.parse(readFileSync(join(dir, 'wake.json'), 'utf8')) as Partial<WakeConfig>
    if (typeof config.phrase !== 'string' || !config.phrase) return undefined
    const heard = Array.isArray(config.heard) ? config.heard.filter((h): h is string => typeof h === 'string' && !!h) : []
    return { phrase: config.phrase, heard: heard.length ? heard : [config.phrase] }
  } catch {
    return undefined
  }
}

const fold = (word: string): string => word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// The recording reaches back to before the word was recognised, so a word or two said before it may come first.
const MAX_LEAD = 4

// What the owner asked for after the wake word: '' when they said only the word, undefined when the transcript does not
// have it near the start (the listener woke to something else, and the recording is not answered).
export function afterWakeWord(text: string, heard: string[]): string | undefined {
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ word: fold(m[0]), end: m.index + m[0].length }))
  const phrases = heard.map((h) => [...h.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => fold(m[0]))).filter((p) => p.length)
  for (let i = 0; i <= MAX_LEAD && i < words.length; i++) {
    const phrase = phrases.find((p) => p.every((w, k) => words[i + k]?.word === w))
    if (phrase) return text.slice(words[i + phrase.length - 1].end).replace(/^[\s\p{P}]+/u, '').trim()
  }
  return undefined
}

// The phrase, for the settings, and the model files, for the screen's listener. The files are revalidated on every
// load (no-cache with an ETag) so a retrained model shows up without a new build, at the cost of one small request.
export function registerWakeWord(app: FastifyInstance, dir: string): void {
  app.get('/api/voice/wake', async (_request, reply) => {
    const config = wakeConfig(dir)
    return config ? { phrase: config.phrase } : reply.code(404).send({ error: 'no wake word model' })
  })
  app.get<{ Params: { file: string } }>('/api/voice/wake/:file', async (request, reply) => {
    const file = WAKE_FILES.find((f) => f === request.params.file)
    if (!file || !wakeConfig(dir)) return reply.code(404).send({ error: 'no such file' })
    const path = join(dir, file)
    const stat = statSync(path)
    const etag = `"${stat.size}-${Math.round(stat.mtimeMs)}"`
    reply.header('Cache-Control', 'no-cache').header('ETag', etag)
    if (request.headers['if-none-match'] === etag) return reply.code(304).send()
    return reply.type('application/octet-stream').send(createReadStream(path))
  })
}
