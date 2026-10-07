const API = 'https://api.elevenlabs.io'

// Flash is the low-latency multilingual model; override it, and the voice, from the environment.
const DEFAULT_MODEL = 'eleven_flash_v2_5'
// Small mp3s: 64 kbps is plenty for speech and keeps each sentence light on the socket.
const OUTPUT_FORMAT = 'mp3_44100_64'

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export interface VoiceConfig {
  apiKey: string
  voiceId: string
  model: string
}

// Null when voice is not configured, so the server runs without it.
export function voiceConfig(): VoiceConfig | null {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID
  return apiKey && voiceId ? { apiKey, voiceId, model: process.env.ELEVENLABS_MODEL || DEFAULT_MODEL } : null
}

async function failure(res: Response): Promise<ElevenLabsError> {
  let detail = ''
  try {
    const body = (await res.json()) as { detail?: { message?: string } | string }
    detail = typeof body.detail === 'string' ? body.detail : (body.detail?.message ?? '')
  } catch {
    // No JSON body.
  }
  return new ElevenLabsError(`ElevenLabs answered ${res.status}${detail ? `: ${detail}` : ''}`, res.status)
}

// Speech for one sentence, as mp3. The language is pinned to Portuguese so a sentence full of English
// terms is not mistaken for English.
export async function synthesize(config: VoiceConfig, text: string): Promise<Buffer> {
  const res = await fetch(`${API}/v1/text-to-speech/${config.voiceId}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: config.model, language_code: 'pt' }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw await failure(res)
  return Buffer.from(await res.arrayBuffer())
}

export interface Usage {
  used: number
  limit: number
}

// Characters spent this billing period against the plan's allowance.
export async function usage(config: VoiceConfig): Promise<Usage> {
  const res = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': config.apiKey }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw await failure(res)
  const body = (await res.json()) as { character_count: number; character_limit: number }
  return { used: body.character_count, limit: body.character_limit }
}
