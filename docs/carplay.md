# CarPlay mode

Opening Meridian in the `carplay` workspace (`?workspace=carplay`) turns on two things made for the car, where
the microphone hears the whole cabin and the Bluetooth link loses the start and the end of what it plays. No
other workspace changes, except the transcription fix below.

## Everywhere

The transcription (`apps/server/src/voice/transcribe.ts`) no longer tags sounds. Scribe used to return
`(batida de porta)` as text and NOX answered it as a request. Only words are kept; a recording with none is
"nothing heard".

## Noise (`?noise=off|normal|strict`, default `normal` in the car)

- **Detector** (`speech-detector.ts`): the room's noise is measured from the quiet part before the owner speaks
  and speech has to stand well above it, so engine and road noise do not hold the recording open. Voice has to
  last a quarter of a second, so a door slam or a horn is not speech. The level is read in the voice band
  (300-3400 Hz). A recording is capped at 30 s.
- **`strict`** raises all of that and also asks the server to drop recordings with a single word or a low
  confidence. `off` is the plain detector.

## Bluetooth audio

- **Warm-up** (`?warmup=off` to disable): from the moment the owner stops talking, a hiss far below what can be
  heard keeps the link open, so the first word is not lost. It stops when NOX is done.
- **Tail** (`?tail=<ms>`, default 500 plus `AudioContext.outputLatency` when the browser has it): after the last
  sentence the link is kept open a little longer, and only then does the microphone reopen, because turning it on
  switches the Bluetooth profile and cuts what is still in the buffer.
- **Experiment** `?audiosession=playback|play-and-record`: fixes the system audio session instead of letting it
  follow the microphone. Needs a browser with `navigator.audioSession`.

The values are in `car-mode.ts`. They are starting points to be tuned in the car.
