package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

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

// A voice note is Opus in Ogg, mono; anything else is converted first.
func (a *App) voiceMessage(ctx context.Context, path string) (*waE2E.Message, error) {
	var out bytes.Buffer
	cmd := exec.CommandContext(ctx, "ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "48000",
		"-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1")
	var stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	seconds := oggSeconds(out.Bytes())
	up, err := a.client.Upload(ctx, out.Bytes(), whatsmeow.MediaAudio)
	if err != nil {
		return nil, err
	}
	return &waE2E.Message{AudioMessage: &waE2E.AudioMessage{
		Mimetype: proto.String("audio/ogg; codecs=opus"), PTT: proto.Bool(true), Seconds: proto.Uint32(seconds),
		Waveform: flatWaveform(),
		URL:      &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey,
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

// The app draws the bars from this; a constant one is enough for the note to play.
func flatWaveform() []byte {
	w := make([]byte, 64)
	for i := range w {
		w[i] = 30
	}
	return w
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
