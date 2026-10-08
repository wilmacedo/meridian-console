# CarPlay mode

A workspace is in CarPlay mode when its **CarPlay** switch (Settings → Layout) is on. The workspace with id
`carplay` starts with it on; any other starts with it off. The mode is for the workspace opened in the car, where
the microphone hears the whole cabin and the Bluetooth link loses the start and the end of what it plays. It starts
the voice options (Settings → Voice) in their car defaults: noise filter normal, Bluetooth warm-up on. The options
are saved with the workspace, so they come back as they were; switching the mode only moves the ones that were never
changed. The defaults are in `voice-prefs.ts`. The mode also brings the car layout (tiles, a bar of large buttons, the
core as the talk button), described in [`design-handoff.md`](design-handoff.md#v12-addition-carplay-layout).

The wake word is off in CarPlay mode, whatever Settings → Voice says: the microphone opens on a tap only. An
always-open microphone keeps the phone's Bluetooth in its call profile, and how that plays with the warm-up, the tail
and the cabin noise has to be tried in the car before it is allowed here.

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

The interface is made for a page about 800 px wide, and the window an in-car browser hands over can be very different.
With AB TV/APTV on the Tiguan's 8" screen (800 px wide) it was measured twice:

- **Desktop site:** a window of about 1280 x 850 px at 1x (worked out from a photo, from the parts of the layout with a
  fixed size: the 76 px bar and the 380 px column of tiles). Everything is drawn at about 60% of its size and the
  image is soft.
- **Mobile site ("request mobile site" in APTV's browser):** a window of 413 x 277 CSS px at 2x. The page is drawn with
  twice the pixels, so it is sharp, but it lays out cramped: labels cut ("H…", "S…"), two tiles, a squeezed core.

The workspace's **Interface scale** (Settings → Layout) lays the page out as if the window were another size
(`layout.w` and `layout.h` are the window divided by the scale) and scales it to fill the window. `auto` does that in
CarPlay mode until the page lays out about 800 px wide: 1.6x for 1280 px, 0.52x for 413 px (it scales down, and the
2x pixel density keeps it sharp). Any other workspace stays at 1x. 0.5x to 2.5x can be fixed by hand.

The window is measured on `resize`, on the visual viewport's, on `orientationchange` and once a second, because an
embedded browser can resize its window without any event. The Display row in Settings → Device shows the window, the
pixel density and how the page is laid out.
