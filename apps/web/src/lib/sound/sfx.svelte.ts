import { audioContext } from '../voice/voice-player.svelte'

// Interface sounds, synthesised by sfx-src/generate.py. Like the orb quality, muting is a device setting.
const KEY = 'meridian.sound'
const VOLUME = 0.5

export type Sfx = 'mic-on' | 'mic-off' | 'speech-end' | 'approval' | 'window-open' | 'window-close' | 'task-done' | 'unavailable'

export const sound = $state({ on: typeof localStorage === 'undefined' || localStorage.getItem(KEY) !== 'off' })

export function setSound(on: boolean): void {
  sound.on = on
  localStorage.setItem(KEY, on ? 'on' : 'off')
}

const buffers = new Map<Sfx, Promise<AudioBuffer>>()

function load(name: Sfx, ctx: AudioContext): Promise<AudioBuffer> {
  let buffer = buffers.get(name)
  if (!buffer) {
    buffer = fetch(`/sfx/${name}.wav`)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
    buffers.set(name, buffer)
  }
  return buffer
}

export function play(name: Sfx): void {
  if (!sound.on || typeof AudioContext === 'undefined') return
  const ctx = audioContext()
  // Before the first gesture the browser keeps the context locked; a sound that cannot be heard yet is dropped.
  if (ctx.state !== 'running') return
  void load(name, ctx).then((buffer) => {
    const node = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = VOLUME
    node.buffer = buffer
    node.connect(gain).connect(ctx.destination)
    node.start()
  })
}
