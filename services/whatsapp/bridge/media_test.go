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
