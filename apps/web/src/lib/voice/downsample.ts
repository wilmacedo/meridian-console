// Brings the microphone down to the 16 kHz the wake word's models and the recording use. Averaging each output
// sample's span of input is a crude low-pass, enough for speech, and works for any input rate (44.1 and 48 kHz alike).
export function createDownsampler(inputRate: number, outputRate: number) {
  const step = inputRate / outputRate
  let position = 0
  let sum = 0
  let count = 0
  return (input: Float32Array): Float32Array => {
    const out = new Float32Array(Math.ceil((input.length + position) / step) + 1)
    let n = 0
    for (const sample of input) {
      sum += sample
      count++
      position += 1
      if (position >= step) {
        out[n++] = sum / count
        sum = 0
        count = 0
        position -= step
      }
    }
    return out.subarray(0, n)
  }
}
