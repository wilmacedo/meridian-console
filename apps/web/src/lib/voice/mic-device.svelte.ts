// Which microphone this device records from. Device ids belong to one browser, so it is a device setting, not
// workspace state.
const KEY = 'meridian.micId'

export const micDevice = $state({
  // Empty follows the system default.
  id: localStorage.getItem(KEY) ?? '',
  inputs: [] as { id: string; label: string }[],
})

// `ideal`, not `exact`: a microphone that was unplugged falls back to the default instead of failing to open.
export const audioConstraints = (): MediaStreamConstraints => ({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(micDevice.id ? { deviceId: { ideal: micDevice.id } } : {}) },
})

export function setMicId(id: string): void {
  micDevice.id = id
  if (id) localStorage.setItem(KEY, id)
  else localStorage.removeItem(KEY)
}

// Labels are empty until the page has had microphone permission once.
export async function refreshMicInputs(): Promise<void> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    micDevice.inputs = all.filter((d) => d.kind === 'audioinput' && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
  } catch {
    micDevice.inputs = []
  }
}

navigator.mediaDevices?.addEventListener?.('devicechange', () => void refreshMicInputs())
