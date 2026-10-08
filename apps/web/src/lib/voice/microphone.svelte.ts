import { agent, kick } from '../agent/agent-state.svelte'
import { cancelPending } from '../dock/dock.svelte'
import { approvals } from '../agent/approval.svelte'
import { workspaceId } from '../workspace/workspace-sync.svelte'
import { live, onWakeVerdict, screenId, sendToServer } from '../live/stream.svelte'
import { play } from '../sound/sfx.svelte'
import { encodeClip } from './clip-encoder'
import { deliver } from './deliver'
import { createDetector } from './speech-detector'
import { tuningFor } from './voice-prefs'
import { applyAudioSession, voicePrefs } from './voice-prefs.svelte'
import { audioContext, interruptPlayback, settleWarmup, startWarmup, stopWarmup } from './voice-player.svelte'
import { setWakeScoreHandler, startCapture, takeCapture, wakeStream } from './wake-listener.svelte'
import { createTrigger } from './wake-trigger'

export const mic = $state({
  phase: 'idle' as 'idle' | 'recording' | 'sending',
  // When the microphone opened (performance.now), for the time counter of the car layout.
  since: 0,
  // The owner just stopped NOX; the button says so for a moment.
  halted: false,
  // When that happened (performance.now), for the burst around the button.
  haltedAt: 0,
  // The owner just dropped a recording; the car hint says nothing was sent.
  cancelled: false,
})

const HALTED_MS = 1600
const CANCELLED_MS = 1800
let haltedTimer: ReturnType<typeof setTimeout> | undefined
let cancelledTimer: ReturnType<typeof setTimeout> | undefined

// Voice input needs a secure context (HTTPS or localhost) and a recorder; without them the mic button is
// inert and NOX is still reachable through `pnpm nox`.
export const micAvailable = (): boolean => isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

// Tuning for the end-of-utterance detector.
const NO_SPEECH_MS = 7000
// After NOX has spoken the mic reopens by itself; this is how long it waits for the owner to carry on.
const FOLLOW_UP_MS = 5000
// How long after its answer ends NOX may still reopen the mic: the end of the speech plays a little later.
const FOLLOW_UP_GRACE_MS = 10_000
// A message to be sent (a WhatsApp voice note) has pauses a question to NOX does not, and the owner may take a
// moment to start.
const MESSAGE_START_MS = 10_000
const MESSAGE_PAUSE_MS = 3000
// Right after the wake word fires its last syllable is still arriving; heard as speech, a pause after "NOX," would send
// the word alone.
const WAKE_SETTLE_MS = 300
// How long a recording the wake word started waits, once it is over, for the server to say this screen is the one
// that answers; a server that never says is taken as a yes.
const GRANT_WAIT_MS = 1500
const TICK_MS = 50
// The voice band, which the level is read from when the noise filter is on: engine and road noise sit below it.
const VOICE_BAND = { low: 300, high: 3400 }
const MIC_LEVEL_GAIN = 6

const MIME_PREFERENCE = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

// What a recording is made of: the browser's recorder, or the samples the wake word listener keeps, which reach back to
// before the word was recognised.
interface Take {
  stop(): Promise<Blob | undefined>
}

function recorderTake(stream: MediaStream): Take {
  const mimeType = MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported(m))
  const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  r.ondataavailable = (e) => chunks.push(e.data)
  r.start()
  return {
    stop: () =>
      new Promise((resolve) => {
        const done = (): void => resolve(chunks.length ? new Blob(chunks, { type: r.mimeType }) : undefined)
        if (r.state === 'inactive') return done()
        r.onstop = done
        r.stop()
      }),
  }
}

function wakeTake(): Take {
  startCapture()
  return {
    stop: async () => {
      const samples = takeCapture()
      return samples?.length ? encodeClip(samples) : undefined
    },
  }
}

let take: Take | undefined
// Set while a recording the wake word started waits to hear whether this screen answers or another one does.
let wakeGrant: Promise<boolean> | undefined
let grant: ((granted: boolean) => void) | undefined
let stream: MediaStream | undefined
let source: MediaStreamAudioSourceNode | undefined
let timer: ReturnType<typeof setInterval> | undefined
// Set while recording: the tap that stops it early.
let stopEarly: (() => void) | undefined
// What the last recording measured of the room's noise, so the next one can tell a quick reply from that noise.
let roomFloor = 0

function release(): void {
  clearInterval(timer)
  source?.disconnect()
  // The wake word listener's stream stays open: it goes on listening.
  if (stream !== wakeStream()) stream?.getTracks().forEach((t) => t.stop())
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

// NOX asked the owner to record a message to send: the next recording is that message, not something said to NOX.
let messageNext = false

export const captureNextMessage = (): void => void (messageNext = true)

// The mic reopens only for the answer to something the owner said: NOX speaking on its own (an agent that
// finished) must not start listening. Infinity while a request is in flight.
let followUpUntil = 0

async function ask(blob: Blob, message: boolean, woken: boolean): Promise<void> {
  conversationEnded = false
  followUpUntil = Infinity
  mic.phase = 'sending'
  agent.mode = 'thinking'
  startWarmup()
  const controller = (asking = new AbortController())
  try {
    const strict = voicePrefs.noise === 'strict' ? '&noise=strict' : ''
    const capture = message ? '&capture=1' : ''
    const woke = woken ? '&wake=1' : ''
    const url = `/api/voice/ask?workspace=${encodeURIComponent(workspaceId())}&screen=${encodeURIComponent(screenId)}${strict}${capture}${woke}`
    const init = { method: 'POST', headers: { 'Content-Type': blob.type.split(';')[0] }, body: blob, signal: controller.signal }
    const res = await (message ? deliver(url, init) : fetch(url, init))
    if (!res.ok || !res.body) {
      // The owner spoke a whole message and is waiting for it to go: say that it did not.
      if (message) play('unavailable')
      stopWarmup()
      return idle()
    }
    // The answer is spoken and acted on by the server; the stream just has to run to its end.
    for await (const _chunk of res.body) void _chunk
    // The reply may already have been spoken, and the mic reopened for the follow-up.
    if (mic.phase === 'sending') mic.phase = 'idle'
  } catch {
    // Cut off by the owner, who is already starting to talk: not ours to reset.
    if (!controller.signal.aborted) {
      if (message) play('unavailable')
      idle()
    }
    stopWarmup()
  } finally {
    if (asking === controller) asking = undefined
    if (followUpUntil === Infinity) followUpUntil = performance.now() + FOLLOW_UP_GRACE_MS
    settleWarmup()
  }
}

// The owner talks over NOX, whether it is still thinking or already speaking: stop what it is doing.
function cutOff(): void {
  asking?.abort()
  asking = undefined
  sendToServer({ type: 'interrupt' })
}

// Stops recording. `send` false throws the recording away.
function finish(send: boolean, heardSpeech: boolean, message = false): void {
  const t = take
  const granted = wakeGrant
  take = undefined
  wakeGrant = undefined
  release()
  if (!t) return idle()
  const sending = send && heardSpeech
  play(sending ? 'speech-end' : 'mic-off')
  void t.stop().then(async (blob) => (sending && blob && (await (granted ?? true)) ? ask(blob, message, !!granted) : idle()))
}

// Another screen heard the wake word better and answers it: this one drops its recording without a sound.
function dropWake(): void {
  const t = take
  take = undefined
  wakeGrant = undefined
  release()
  void t?.stop()
  idle()
}

async function begin({ followUp = false, woken = false } = {}): Promise<void> {
  mic.phase = 'recording'
  // Used up by this recording, whatever becomes of it: the server forgets the request just as fast. A wake word
  // starts something said to NOX, and leaves the message for the recording after it.
  const message = !woken && messageNext
  if (!woken) messageNext = false
  stopWarmup()
  applyAudioSession()
  const shared = wakeStream()
  try {
    stream = shared ?? (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }))
  } catch {
    return idle()
  }
  take = woken ? wakeTake() : recorderTake(stream)

  const ctx = audioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  source = ctx.createMediaStreamSource(stream)
  if (voicePrefs.noise !== 'off') {
    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = VOICE_BAND.low
    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = VOICE_BAND.high
    source.connect(highpass).connect(lowpass).connect(analyser)
  } else source.connect(analyser)
  const data = new Float32Array(analyser.fftSize)

  agent.mode = 'listening'
  mic.since = performance.now()
  mic.halted = false
  mic.cancelled = false
  kick(1)
  // A wake word's chime waits for the server to say this is the screen that answers.
  if (!woken && (!followUp || message)) play('mic-on')

  const startedAt = performance.now()
  const deafUntil = woken ? startedAt + WAKE_SETTLE_MS : 0
  const tuning = tuningFor(voicePrefs.noise)
  const detector = message
    ? createDetector({ ...tuning, silenceMs: Math.max(tuning.silenceMs, MESSAGE_PAUSE_MS), noiseEndMs: Math.max(tuning.noiseEndMs, MESSAGE_PAUSE_MS) }, startedAt, MESSAGE_START_MS, roomFloor)
    : createDetector(tuning, startedAt, followUp || woken ? FOLLOW_UP_MS : NO_SPEECH_MS, roomFloor)
  timer = setInterval(() => {
    analyser.getFloatTimeDomainData(data)
    const level = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length)
    agent.micLevel = Math.min(1, level * MIC_LEVEL_GAIN)
    const now = performance.now()
    if (now < deafUntil) return
    const verdict = detector.push(level, now)
    roomFloor = detector.floor
    if (verdict) finish(verdict === 'send', detector.heardSpeech, message)
  }, TICK_MS)
  stopEarly = () => finish(true, detector.heardSpeech, message)
}

// NOX has something running that the owner can stop: a turn in flight, its voice, a background task or a pin.
export const busy = (): boolean => mic.phase === 'sending' || agent.mode === 'thinking' || agent.mode === 'speaking' || agent.working

// Stops everything NOX is doing: the turn, its voice, the workspace's background tasks and a pending pin.
export function halt(): void {
  followUpUntil = 0
  messageNext = false
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
  // The confirmation of a halt is not a button: a tap on it must not open the microphone.
  if (mic.halted) return
  if (busy()) return halt()
  await begin()
}

// Esc or the cancel button: drop the recording. Returns true when there was one to drop.
export function cancelListening(): boolean {
  if (mic.phase !== 'recording') return false
  finish(false, false)
  mic.cancelled = true
  clearTimeout(cancelledTimer)
  cancelledTimer = setTimeout(() => (mic.cancelled = false), CANCELLED_MS)
  return true
}

// Space: send the recording, or stop NOX when it is busy. It never starts listening.
export function spaceAction(): void {
  if (mic.phase === 'recording') stopEarly?.()
  else if (busy()) halt()
}

// NOX finished speaking: keep listening for a while, so a conversation does not need a tap per turn. Quiet for
// FOLLOW_UP_MS ends it, with the same sound as any other recording that is dropped.
export async function continueListening(): Promise<void> {
  if (performance.now() > followUpUntil) return
  followUpUntil = 0
  if (conversationEnded) {
    conversationEnded = false
    return
  }
  if (!micAvailable() || live.link === 'offline' || mic.phase === 'recording' || approvals.pending.length) return
  await begin({ followUp: true })
}

// The wake word: the same as a tap, said instead. Over NOX thinking or speaking it cuts the answer off and listens
// (its background tasks go on: "para tudo" is something to say to it). Every screen in earshot asks the server, which
// lets the one that heard it best answer.
async function wakeUp(score: number): Promise<void> {
  if (!micAvailable() || live.link === 'offline' || mic.phase === 'recording' || mic.halted || !wakeStream()) return
  if (mic.phase === 'sending' || agent.mode === 'thinking' || agent.mode === 'speaking') {
    followUpUntil = 0
    cutOff()
    interruptPlayback()
  }
  wakeGrant = new Promise((resolve) => (grant = resolve))
  const mine = grant
  setTimeout(() => grant === mine && answerWake(true), GRANT_WAIT_MS)
  sendToServer({ type: 'wake', score })
  await begin({ woken: true })
}

function answerWake(granted: boolean): void {
  const resolve = grant
  grant = undefined
  if (!resolve) return
  resolve(granted)
  if (!take || !wakeGrant) return
  if (granted) play('mic-on')
  else dropWake()
}

const trigger = createTrigger()
setWakeScoreHandler((score) => {
  if (trigger.push(score, performance.now(), voicePrefs.wakeSensitivity, agent.mode === 'speaking')) void wakeUp(score)
})
onWakeVerdict(answerWake)
