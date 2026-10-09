package main

import (
	"context"
	"encoding/binary"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func oggPage(granule int64) []byte {
	page := make([]byte, 27)
	copy(page, "OggS")
	binary.LittleEndian.PutUint64(page[6:14], uint64(granule))
	return page
}

func TestOggSecondsReadsTheLastPage(t *testing.T) {
	stream := append(append(oggPage(0), make([]byte, 100)...), oggPage(7*48000+312)...)
	if got := oggSeconds(stream); got != 7 {
		t.Fatalf("got %d seconds, want 7", got)
	}
}

func TestOggSecondsFallsBackToOne(t *testing.T) {
	for name, stream := range map[string][]byte{"empty": nil, "short": oggPage(48000 / 4), "unset granule": oggPage(-1)} {
		if got := oggSeconds(stream); got != 1 {
			t.Errorf("%s: got %d seconds, want 1", name, got)
		}
	}
}

// Eight seconds of audio whose timestamps jump seven seconds in the middle, like a browser recording that paused.
func TestOggOpusRebuildsTimestampsThatJump(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg is not installed")
	}
	path := filepath.Join(t.TempDir(), "recording.webm")
	gen := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=8",
		"-af", `asetpts=PTS+gte(T\,3)*7/TB`, "-c:a", "libopus", "-f", "webm", "pipe:1")
	webm, err := gen.Output()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, webm, 0o600); err != nil {
		t.Fatal(err)
	}
	ogg, err := oggOpus(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	if got := oggSeconds(ogg); got != 8 {
		t.Fatalf("got %d seconds, want 8", got)
	}
}

func TestWaveformFollowsTheLoudness(t *testing.T) {
	samples := make([]int16, 64*100)
	for i := range samples {
		if bar := i / 100; bar >= 32 {
			samples[i] = int16(8000 * (i%2*2 - 1))
		} else if bar >= 16 {
			samples[i] = int16(2000 * (i%2*2 - 1))
		}
	}
	bars := waveformOf(samples)
	if len(bars) != 64 || bars[0] != 0 || bars[20] != 25 || bars[40] != 100 {
		t.Fatalf("got %v", bars)
	}
}

func TestWaveformOfTooLittleAudioIsEven(t *testing.T) {
	for _, bar := range waveformOf(make([]int16, 10)) {
		if bar != 30 {
			t.Fatalf("got bar %d, want 30", bar)
		}
	}
}

// Silence, then a tone: the bars must be low first and high after, read from the converted note itself.
func TestWaveformReadsTheConvertedNote(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg is not installed")
	}
	path := filepath.Join(t.TempDir(), "note.wav")
	gen := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=2", "-f", "lavfi", "-i", "sine=frequency=300:duration=2",
		"-filter_complex", "[0][1]concat=n=2:v=0:a=1", "-y", path)
	if out, err := gen.CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	ogg, err := encodeOpus(context.Background(), path, "asetpts=N/SR/TB")
	if err != nil {
		t.Fatal(err)
	}
	bars := waveform(context.Background(), ogg)
	if bars[10] > 5 || bars[50] < 80 {
		t.Fatalf("got %v", bars)
	}
}

func encodeTestNote(t *testing.T, filter string) string {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg is not installed")
	}
	path := filepath.Join(t.TempDir(), "note.webm")
	gen := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=4", "-f", "lavfi", "-i", "sine=frequency=300:duration=2,volume=0.3",
		"-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=3", "-filter_complex", filter, "-c:a", "libopus", "-y", path)
	if out, err := gen.CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	return path
}

// Four seconds before the owner speaks and three of pause after: the note keeps the two spoken and a breath.
func TestOggOpusCutsTheSilenceAtEitherEnd(t *testing.T) {
	ogg, err := oggOpus(context.Background(), encodeTestNote(t, "[0][1][2]concat=n=3:v=0:a=1"))
	if err != nil {
		t.Fatal(err)
	}
	if secs := float64(oggSamples(ogg)) / 48000; secs < 2 || secs > 3 {
		t.Fatalf("got %.2f seconds, want about 2.5", secs)
	}
}

func TestOggOpusKeepsANoteThatIsAllSilence(t *testing.T) {
	ogg, err := oggOpus(context.Background(), encodeTestNote(t, "[0][2]concat=n=2:v=0:a=1"))
	if err != nil {
		t.Fatal(err)
	}
	if got := oggSeconds(ogg); got != 7 {
		t.Fatalf("got %d seconds, want 7", got)
	}
}
