package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

type App struct {
	client  *whatsmeow.Client
	store   *Store
	dataDir string

	mu    sync.Mutex
	state string
	qr    string
	phone string
}

func (a *App) setState(state, qr string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.state, a.qr = state, qr
}

func (a *App) snapshot() (state, qr, phone string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.state, a.qr, a.phone
}

// Chats show up as phone-number JIDs when WhatsApp reveals the mapping, so a contact is one chat, not two.
func (a *App) normalize(ctx context.Context, jid types.JID) types.JID {
	jid = jid.ToNonAD()
	if jid.Server == types.HiddenUserServer {
		if pn, err := a.client.Store.LIDs.GetPNForLID(ctx, jid); err == nil && !pn.IsEmpty() {
			return pn
		}
	}
	return jid
}

func (a *App) displayName(ctx context.Context, jid types.JID) string {
	if jid.Server == types.GroupServer {
		if name, _ := a.store.ChatName(jid.String()); name != "" {
			return name
		}
		return jid.User
	}
	if c, err := a.client.Store.Contacts.GetContact(ctx, jid); err == nil {
		for _, n := range []string{c.FullName, c.FirstName, c.BusinessName, c.PushName} {
			if n != "" {
				return n
			}
		}
	}
	if name, _ := a.store.ChatName(jid.String()); name != "" {
		return name
	}
	return jid.User
}

func (a *App) onEvent(raw any) {
	ctx := context.Background()
	switch evt := raw.(type) {
	case *events.Connected:
		a.mu.Lock()
		a.state, a.qr = "connected", ""
		if id := a.client.Store.ID; id != nil {
			a.phone = id.User
		}
		a.mu.Unlock()
		_ = a.client.SendPresence(ctx, types.PresenceUnavailable)
	case *events.Disconnected:
		a.setState("connecting", "")
	case *events.LoggedOut:
		fmt.Fprintln(os.Stderr, "logged out from the phone; exiting so the supervisor starts a fresh pairing")
		os.Exit(exitLoggedOut)
	case *events.Message:
		a.ingest(ctx, evt)
	case *events.HistorySync:
		for _, conv := range evt.Data.GetConversations() {
			chat, err := types.ParseJID(conv.GetID())
			if err != nil {
				continue
			}
			for _, m := range conv.GetMessages() {
				parsed, err := a.client.ParseWebMessage(chat, m.GetMessage())
				if err != nil {
					continue
				}
				a.ingest(ctx, parsed)
			}
			if name := conv.GetName(); name != "" && chat.Server == types.GroupServer {
				_ = a.store.UpsertChat(a.normalize(ctx, chat).String(), name, true, 0)
			}
		}
	case *events.GroupInfo:
		if evt.Name != nil {
			_ = a.store.UpsertChat(evt.JID.String(), evt.Name.Name, true, 0)
		}
	}
}

func (a *App) ingest(ctx context.Context, evt *events.Message) {
	msg := evt.Message
	if msg == nil {
		return
	}
	text, mediaType, filename, replyTo := describe(msg)
	if text == "" && mediaType == "" {
		return
	}
	chat := a.normalize(ctx, evt.Info.Chat)
	if chat.Server == types.BroadcastServer {
		return
	}
	isGroup := chat.Server == types.GroupServer
	name := ""
	if isGroup {
		if info, err := a.client.GetGroupInfo(ctx, chat); err == nil {
			name = info.Name
		}
	} else if !evt.Info.IsFromMe {
		name = evt.Info.PushName
	}
	ts := evt.Info.Timestamp.UnixMilli()
	if err := a.store.UpsertChat(chat.String(), name, isGroup, ts); err != nil {
		fmt.Fprintln(os.Stderr, "store chat:", err)
		return
	}
	sender := a.normalize(ctx, evt.Info.Sender).String()
	if evt.Info.IsFromMe && a.client.Store.ID != nil {
		sender = a.client.Store.ID.ToNonAD().String()
	}
	var raw []byte
	if mediaType != "" {
		raw, _ = proto.Marshal(msg)
	}
	err := a.store.PutMessage(Message{
		ID: evt.Info.ID, Chat: chat.String(), Sender: sender, FromMe: evt.Info.IsFromMe,
		TS: ts, Text: text, MediaType: mediaType, Filename: filename, ReplyTo: replyTo,
	}, raw)
	if err != nil {
		fmt.Fprintln(os.Stderr, "store message:", err)
	}
}

// describe flattens a message to what a reader needs: its text (or caption), a media kind and any reply target.
func describe(m *waE2E.Message) (text, mediaType, filename, replyTo string) {
	if m.GetEphemeralMessage() != nil {
		return describe(m.GetEphemeralMessage().GetMessage())
	}
	if m.GetViewOnceMessage() != nil {
		return describe(m.GetViewOnceMessage().GetMessage())
	}
	if m.GetDocumentWithCaptionMessage() != nil {
		return describe(m.GetDocumentWithCaptionMessage().GetMessage())
	}
	var ctxInfo *waE2E.ContextInfo
	switch {
	case m.GetConversation() != "":
		text = m.GetConversation()
	case m.GetExtendedTextMessage() != nil:
		text = m.GetExtendedTextMessage().GetText()
		ctxInfo = m.GetExtendedTextMessage().GetContextInfo()
	case m.GetImageMessage() != nil:
		mediaType, text = "image", m.GetImageMessage().GetCaption()
		ctxInfo = m.GetImageMessage().GetContextInfo()
	case m.GetVideoMessage() != nil:
		mediaType, text = "video", m.GetVideoMessage().GetCaption()
		ctxInfo = m.GetVideoMessage().GetContextInfo()
	case m.GetAudioMessage() != nil:
		mediaType = "audio"
		if m.GetAudioMessage().GetPTT() {
			mediaType = "voice"
		}
		ctxInfo = m.GetAudioMessage().GetContextInfo()
	case m.GetDocumentMessage() != nil:
		d := m.GetDocumentMessage()
		mediaType, text, filename = "document", d.GetCaption(), d.GetFileName()
		ctxInfo = d.GetContextInfo()
	case m.GetStickerMessage() != nil:
		mediaType = "sticker"
	case m.GetLocationMessage() != nil:
		l := m.GetLocationMessage()
		text = strings.TrimSpace(fmt.Sprintf("[location] %s %s", l.GetName(), l.GetAddress()))
	case m.GetContactMessage() != nil:
		text = "[contact] " + m.GetContactMessage().GetDisplayName()
	}
	return text, mediaType, filename, ctxInfo.GetStanzaID()
}

func (a *App) mediaPath(chat, id, ext string) string {
	safe := strings.NewReplacer("@", "_", "/", "_", ":", "_").Replace(chat)
	return filepath.Join(a.dataDir, "media", safe, id+ext)
}

func (a *App) connect(ctx context.Context) error {
	if a.client.Store.ID == nil {
		return a.pair(ctx)
	}
	a.setState("connecting", "")
	return a.client.ConnectContext(ctx)
}

// Pairing waits for the phone to scan; a QR code lives about a minute and the channel ends when the last expires.
func (a *App) pair(ctx context.Context) error {
	qrChan, err := a.client.GetQRChannel(ctx)
	if err != nil {
		return err
	}
	if err := a.client.ConnectContext(ctx); err != nil {
		return err
	}
	go func() {
		for evt := range qrChan {
			switch evt.Event {
			case "code":
				a.setState("pairing", evt.Code)
			case "success":
				a.setState("connecting", "")
			default:
				fmt.Fprintln(os.Stderr, "pairing ended:", evt.Event)
				time.Sleep(time.Second)
				os.Exit(exitPairingEnded)
			}
		}
	}()
	return nil
}
