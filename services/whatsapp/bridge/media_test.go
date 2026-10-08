package main

import (
	"encoding/binary"
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
