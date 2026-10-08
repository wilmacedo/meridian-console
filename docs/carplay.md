# CarPlay mode

The `carplay` workspace is the one opened in the car, where the microphone hears the whole cabin and the Bluetooth
link loses the start and the end of what it plays. It starts with the noise filter and the Bluetooth warm-up on;
any other workspace starts plain. The options are in **Settings → 07 · Voice** of each workspace, saved with it (so
they can be tuned from the desktop while parked), and the defaults are in `voice-prefs.ts`.

## Everywhere

The transcription (`apps/server/src/voice/transcribe.ts`) no longer tags sounds. Scribe used to return
`(batida de porta)` as text and NOX answered it as a request. Only words are kept; a recording with none is
"nothing heard".

## Noise filter (off / normal / strict)

The detector is `speech-detector.ts`; the numbers per level are in `voice-prefs.ts`.

- The room's noise is measured from the quiet part before the owner speaks, and speech has to stand well above it,
  so engine and road noise do not hold the recording open.
- Voice has to add up to a quarter of a second within half a second, so a door slam or a horn is not speech.
- The level is read in the voice band (300-3400 Hz).
- A loud stretch whose level barely varies for half a second (a truck idling, a fan) is noise, not speech. After
  the last speech the recording ends on a 1 s pause in a quiet room and on 3.5 s when the noise stays loud.
  Caveat: speech held at one level for half a second (a flat hum, a whisper) can be mistaken for it.
- A recording is capped at 1 minute.
- **strict** raises all of that and also asks the server to drop recordings with a single word or a low
  confidence. **off** is the plain detector.

## Bluetooth audio

- **Warm-up**: from the moment the owner stops talking, a hiss far below what can be heard keeps the link open, so
  the first word is not lost. It stops when NOX is done.
- **Tail** (default 500 ms plus `AudioContext.outputLatency` when the browser has it): after the last sentence the
  link is kept open a little longer, and only then does the microphone reopen, because turning it on switches the
  Bluetooth profile and cuts what is still in the buffer.
- **Audio session** (auto / playback / call): an experiment that fixes the system audio session instead of letting
  it follow the microphone. Needs a browser with `navigator.audioSession`.

These values are starting points to be tuned in the car.
