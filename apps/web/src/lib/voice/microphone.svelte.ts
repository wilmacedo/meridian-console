import { agent, kick } from '../agent/agent-state.svelte'
import { cancelPending } from '../dock/dock.svelte'
import { approvals } from '../agent/approval.svelte'
import { workspaceId } from '../workspace/workspace-sync.svelte'
import { live, screenId, sendToServer } from '../live/stream.svelte'
import { play } from '../sound/sfx.svelte'
import { audioContext, interruptPlayback } from './voice-player.svelte'

export const mic = $state({
  phase: 'idle' as 'idle' | 'recording' | 'sending',
  // The owner just stopped NOX; the button says so for a moment.
  halted: false,
  // When that happened (performance.now), for the burst around the button.
  haltedAt: 0,
})

const HALTED_MS = 1600
let haltedTimer: ReturnType<typeof setTimeout> | undefined

// Voice input needs a secure context (HTTPS or localhost) and a recorder; without them the mic button is
// inert and NOX is still reachable through `pnpm nox`.
export const micAvailable = (): boolean => isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

// Tuning for the end-of-utterance detector.
const SPEECH_LEVEL = 0.02
const SILENCE_MS = 1000
const NO_SPEECH_MS = 7000
// After NOX has spoken the mic reopens by itself; this is how long it waits for the owner to carry on.
const FOLLOW_UP_MS = 5000
// Only a guard for a noisy room that never goes quiet; a recording this long is still far below the server's 10 MB limit.
const MAX_MS = 10 * 60_000
const TICK_MS = 50
const MIC_LEVEL_GAIN = 6

const MIME_PREFERENCE = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

let recorder: MediaRecorder | undefined
let stream: MediaStream | undefined
let source: MediaStreamAudioSourceNode | undefined
let timer: ReturnType<typeof setInterval> | undefined
// Set while recording: the tap that stops it early.
let stopEarly: (() => void) | undefined

function release(): void {
  clearInterval(timer)
  source?.disconnect()
  stream?.getTracks().forEach((t) => t.stop())
  source = undefined
  stream = undefined
  agent.micLevel = 0
}

function idle(): void {
  mic.phase = 'idle'
  agent.mode = 'idle'
}

// The request in flight, so the owner can cut it off.
let asking: AbortController | undefined

// NOX judged the owner's last words a goodbye: after its reply the mic stays closed.
let conversationEnded = false

export const endConversation = (): void => void (conversationEnded = true)

async function ask(blob: Blob): Promise<void> {
  conversationEnded = false
  mic.phase = 'sending'
  agent.mode = 'thinking'
  const controller = (asking = new AbortController())
  try {
    const res = await fetch(`/api/voice/ask?workspace=${encodeURIComponent(workspaceId())}&screen=${encodeURIComponent(screenId)}`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type.split(';')[0] },
      body: blob,
      signal: controller.signal,
    })
    if (!res.ok || !res.body) return idle()
    // The answer is spoken and acted on by the server; the stream just has to run to its end.
    for await (const _chunk of res.body) void _chunk
    // The reply may already have been spoken, and the mic reopened for the follow-up.
    if (mic.phase === 'sending') mic.phase = 'idle'
  } catch {
    // Cut off by the owner, who is already starting to talk: not ours to reset.
    if (!controller.signal.aborted) idle()
  } finally {
    if (asking === controller) asking = undefined
  }
}

// The owner talks over NOX, whether it is still thinking or already speaking: stop what it is doing.
function cutOff(): void {
  asking?.abort()
  asking = undefined
  sendToServer({ type: 'interrupt' })
}

// Stops recording. `send` false throws the recording away.
function finish(send: boolean, heardSpeech: boolean): void {
  const r = recorder
  recorder = undefined
  release()
  if (!r || r.state === 'inactive') return idle()
  play(send && heardSpeech ? 'speech-end' : 'mic-off')
  const chunks: Blob[] = []
  r.ondataavailable = (e) => chunks.push(e.data)
  r.onstop = () => (send && heardSpeech && chunks.length ? void ask(new Blob(chunks, { type: r.mimeType })) : idle())
  r.stop()
}

async function begin(followUp = false): Promise<void> {
  mic.phase = 'recording'
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  } catch {
    return idle()
  }
  const mimeType = MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported(m))
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => chunks.push(e.data)

  const ctx = audioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  source = ctx.createMediaStreamSource(stream)
  source.connect(analyser)
  const data = new Float32Array(analyser.fftSize)

  agent.mode = 'listening'
  mic.halted = false
  kick(1)
  if (!followUp) play('mic-on')
  recorder.start()

  const startedAt = performance.now()
  let heardSpeech = false
  let lastSpeechAt = startedAt
  timer = setInterval(() => {
    analyser.getFloatTimeDomainData(data)
    const level = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length)
    agent.micLevel = Math.min(1, level * MIC_LEVEL_GAIN)
    const now = performance.now()
    if (level > SPEECH_LEVEL) {
      heardSpeech = true
      lastSpeechAt = now
    }
    if (heardSpeech && now - lastSpeechAt > SILENCE_MS) finish(true, heardSpeech)
    else if (!heardSpeech && now - startedAt > (followUp ? FOLLOW_UP_MS : NO_SPEECH_MS)) finish(false, false)
    else if (now - startedAt > MAX_MS) finish(true, heardSpeech)
  }, TICK_MS)
  stopEarly = () => finish(true, heardSpeech)
}

// NOX has something running that the owner can stop: a turn in flight, its voice, a background task or a pin.
export const busy = (): boolean => mic.phase === 'sending' || agent.mode === 'thinking' || agent.mode === 'speaking' || agent.working

// Stops everything NOX is doing: the turn, its voice, the workspace's background tasks and a pending pin.
export function halt(): void {
  cutOff()
  interruptPlayback()
  sendToServer({ type: 'stop_tasks' })
  cancelPending()
  mic.phase = 'idle'
  agent.mode = 'idle'
  agent.amplitude = 0
  mic.halted = true
  mic.haltedAt = performance.now()
  kick(1)
  play('mic-off')
  clearTimeout(haltedTimer)
  haltedTimer = setTimeout(() => (mic.halted = false), HALTED_MS)
}

// Esc: stop NOX if it is busy. Returns true when there was something to stop.
export function haltIfBusy(): boolean {
  if (!busy()) return false
  halt()
  return true
}

// Tap to talk, tap again to send now; a pause in the speech sends it by itself. Tapping while NOX is
// busy stops it, for real: the server stops the turn, the voice and the workspace's background tasks.
export async function toggleListening(): Promise<void> {
  if (!micAvailable() || live.link === 'offline') return play('unavailable')
  if (mic.phase === 'recording') return stopEarly?.()
  if (busy()) return halt()
  await begin()
}

// Esc: drop the recording. Returns true when there was one to drop.
export function cancelListening(): boolean {
  if (mic.phase !== 'recording') return false
  finish(false, false)
  return true
}

// NOX finished speaking: keep listening for a while, so a conversation does not need a tap per turn. Quiet for
// FOLLOW_UP_MS ends it, with the same sound as any other recording that is dropped.
export async function continueListening(): Promise<void> {
  if (conversationEnded) {
    conversationEnded = false
    return
  }
  if (!micAvailable() || live.link === 'offline' || mic.phase === 'recording' || approvals.pending.length) return
  await begin(true)
}
