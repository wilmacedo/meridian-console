# CarPlay mode

A workspace is in CarPlay mode when its **CarPlay** switch (Settings → Layout) is on. The workspace with id
`carplay` starts with it on; any other starts with it off. The mode is for the workspace opened in the car, where
the microphone hears the whole cabin and the Bluetooth link loses the start and the end of what it plays. It starts
the voice options (Settings → Voice) in their car defaults: noise filter normal, Bluetooth warm-up on. The options
are saved with the workspace, so they come back as they were; switching the mode only moves the ones that were never
changed. The defaults are in `voice-prefs.ts`. The mode also brings the car layout (tiles, a bar of large buttons, the
core as the talk button), described in [`design-handoff.md`](design-handoff.md#v12-addition-carplay-layout).

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

## Interface scale

An in-car browser can hand the page a window much larger than the screen it ends up on: the Tiguan's 8" screen, through
AB TV, showed a page laid out at about 1280 x 850 px (measured from a photo of the layout, whose fixed-size parts, the
76 px bar and the 380 px column of tiles, give the scale), on a screen 800 px wide. Everything is then drawn at about
60% of its size and the text is unreadable. The workspace's **Interface scale** (Settings → Layout) enlarges the whole
page: it is laid out as if the window were smaller (`layout.w` and `layout.h` are the window divided by the scale) and
scaled up to fill it. `auto` does that in CarPlay mode, until the page is about 800 px wide (1.6x for 1280 px), and
leaves any other workspace alone; 1x, 1.5x, 2x and 2.5x fix it. The Display row in Settings → Device shows the window,
the pixel density and how the page is laid out.
