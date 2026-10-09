package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"google.golang.org/protobuf/proto"
)

const maxUploadBytes = 64 << 20

func (a *App) mediaMessage(ctx context.Context, req sendRequest) (*waE2E.Message, error) {
	if !filepath.IsAbs(req.Path) {
		return nil, errors.New("path must be absolute")
	}
	info, err := os.Stat(req.Path)
	if err != nil {
		return nil, err
	}
	if info.Size() > maxUploadBytes {
		return nil, fmt.Errorf("file is larger than %d MB", maxUploadBytes>>20)
	}
	data, err := os.ReadFile(req.Path)
	if err != nil {
		return nil, err
	}
	mimeType := http.DetectContentType(data)
	if byExt := mime.TypeByExtension(strings.ToLower(filepath.Ext(req.Path))); byExt != "" && strings.HasPrefix(mimeType, "application/") {
		mimeType = byExt
	}

	if req.Voice {
		return a.voiceMessage(ctx, req.Path)
	}

	var kind whatsmeow.MediaType
	switch {
	case strings.HasPrefix(mimeType, "image/"):
		kind = whatsmeow.MediaImage
	case strings.HasPrefix(mimeType, "video/"):
		kind = whatsmeow.MediaVideo
	case strings.HasPrefix(mimeType, "audio/"):
		kind = whatsmeow.MediaAudio
	default:
		kind = whatsmeow.MediaDocument
	}
	up, err := a.client.Upload(ctx, data, kind)
	if err != nil {
		return nil, err
	}
	switch kind {
	case whatsmeow.MediaImage:
		return &waE2E.Message{ImageMessage: &waE2E.ImageMessage{
			Caption: proto.String(req.Text), Mimetype: proto.String(mimeType),
			URL: &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey,
			FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: &up.FileLength,
		}}, nil
	case whatsmeow.MediaVideo:
		return &waE2E.Message{VideoMessage: &waE2E.VideoMessage{
			Caption: proto.String(req.Text), Mimetype: proto.String(mimeType),
			URL: &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey,
			FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: &up.FileLength,
		}}, nil
	case whatsmeow.MediaAudio:
		return &waE2E.Message{AudioMessage: &waE2E.AudioMessage{
			Mimetype: proto.String(mimeType),
			URL:      &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey,
			FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: &up.FileLength,
		}}, nil
	}
	return &waE2E.Message{DocumentMessage: &waE2E.DocumentMessage{
		Caption: proto.String(req.Text), Mimetype: proto.String(mimeType),
		FileName: proto.String(filepath.Base(req.Path)), Title: proto.String(filepath.Base(req.Path)),
		URL: &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey,
		FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: &up.FileLength,
	}}, nil
}

// A voice note is Opus in Ogg, mono; anything else is converted first. The timestamps are rebuilt from the samples:
// a browser recording can jump in time (a tab in the background, a microphone that paused), and ffmpeg carries the
// jump into the Ogg granules, which then promise seconds of audio that are not there. That is the one difference found
// between a recorded note the iPhone app called "not available" and a note spoken from an mp3, which played.
func oggOpus(ctx context.Context, path string) ([]byte, error) {
	var out, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "48000",
		"-af", "asetpts=N/SR/TB", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1")
	cmd.Stdout, cmd.Stderr = &out, &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return out.Bytes(), nil
}

func (a *App) voiceMessage(ctx context.Context, path string) (*waE2E.Message, error) {
	ogg, err := oggOpus(ctx, path)
	if err != nil {
		return nil, err
	}
	up, err := a.client.Upload(ctx, ogg, whatsmeow.MediaAudio)
	if err != nil {
		return nil, err
	}
	return &waE2E.Message{AudioMessage: &waE2E.AudioMessage{
		Mimetype: proto.String("audio/ogg; codecs=opus"), PTT: proto.Bool(true), Seconds: proto.Uint32(oggSeconds(ogg)),
		Waveform: waveform(ctx, ogg), MediaKeyTimestamp: proto.Int64(time.Now().Unix()),
		URL: &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey,
		FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: &up.FileLength,
	}}, nil
}

// The length of an Ogg Opus stream, from the granule position of its last page (always counted at 48 kHz). A
// recording from a browser has no duration in its header, so the source file cannot tell.
func oggSeconds(ogg []byte) uint32 {
	i := bytes.LastIndex(ogg, []byte("OggS"))
	if i < 0 || len(ogg) < i+14 {
		return 1
	}
	granule := int64(binary.LittleEndian.Uint64(ogg[i+6 : i+14]))
	if secs := (granule + 24000) / 48000; secs > 1 {
		return uint32(secs)
	}
	return 1
}

const waveformBars = 64

// The app draws the note's bars from this, it does not measure the audio itself: the loudness of each of 64 slices,
// 0 to 100 against the loudest. A note whose audio cannot be read again still plays, with even bars.
func waveform(ctx context.Context, ogg []byte) []byte {
	var pcm, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1")
	cmd.Stdin, cmd.Stdout, cmd.Stderr = bytes.NewReader(ogg), &pcm, &stderr
	if err := cmd.Run(); err != nil {
		return waveformOf(nil)
	}
	samples := make([]int16, pcm.Len()/2)
	for i := range samples {
		samples[i] = int16(binary.LittleEndian.Uint16(pcm.Bytes()[2*i:]))
	}
	return waveformOf(samples)
}

func waveformOf(samples []int16) []byte {
	bars := make([]byte, waveformBars)
	if len(samples) < waveformBars {
		for i := range bars {
			bars[i] = 30
		}
		return bars
	}
	levels := make([]float64, waveformBars)
	loudest := 0.0
	for i := range levels {
		slice := samples[i*len(samples)/waveformBars : (i+1)*len(samples)/waveformBars]
		sum := 0.0
		for _, v := range slice {
			sum += float64(v) * float64(v)
		}
		levels[i] = math.Sqrt(sum / float64(len(slice)))
		loudest = math.Max(loudest, levels[i])
	}
	for i, level := range levels {
		if loudest > 0 {
			bars[i] = byte(math.Round(100 * level / loudest))
		}
	}
	return bars
}

func extensionOf(msg *waE2E.Message, kind string) string {
	var mimeType, filename string
	switch {
	case msg.GetImageMessage() != nil:
		mimeType = msg.GetImageMessage().GetMimetype()
	case msg.GetVideoMessage() != nil:
		mimeType = msg.GetVideoMessage().GetMimetype()
	case msg.GetAudioMessage() != nil:
		mimeType = msg.GetAudioMessage().GetMimetype()
	case msg.GetStickerMessage() != nil:
		mimeType = msg.GetStickerMessage().GetMimetype()
	case msg.GetDocumentMessage() != nil:
		mimeType, filename = msg.GetDocumentMessage().GetMimetype(), msg.GetDocumentMessage().GetFileName()
	}
	if ext := filepath.Ext(filename); ext != "" {
		return strings.ToLower(ext)
	}
	switch strings.SplitN(mimeType, ";", 2)[0] {
	case "audio/ogg":
		return ".ogg"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	}
	if exts, _ := mime.ExtensionsByType(strings.SplitN(mimeType, ";", 2)[0]); len(exts) > 0 {
		return exts[0]
	}
	return "." + kind
}
