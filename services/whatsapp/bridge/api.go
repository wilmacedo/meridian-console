package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

const maxLimit = 200

func (a *App) handler(token string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /status", a.handleStatus)
	mux.HandleFunc("GET /contacts", a.handleContacts)
	mux.HandleFunc("GET /chats", a.handleChats)
	mux.HandleFunc("GET /messages", a.handleMessages)
	mux.HandleFunc("POST /send", a.handleSend)
	mux.HandleFunc("POST /download", a.handleDownload)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		given := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if subtle.ConstantTimeCompare([]byte(given), []byte(token)) != 1 {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func reply(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, status int, err error) {
	reply(w, status, map[string]string{"error": err.Error()})
}

func limitOf(r *http.Request, def int) int {
	n, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || n < 1 {
		return def
	}
	return min(n, maxLimit)
}

func int64Of(r *http.Request, key string) int64 {
	n, _ := strconv.ParseInt(r.URL.Query().Get(key), 10, 64)
	return n
}

func (a *App) handleStatus(w http.ResponseWriter, _ *http.Request) {
	state, qr, phone := a.snapshot()
	reply(w, 200, map[string]string{"state": state, "qr": qr, "phone": phone})
}

type contactOut struct {
	JID   string `json:"jid"`
	Name  string `json:"name"`
	Group bool   `json:"isGroup"`
}

func (a *App) handleContacts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	if q == "" {
		fail(w, 400, errors.New("q is required"))
		return
	}
	seen := map[string]contactOut{}
	contacts, err := a.client.Store.Contacts.GetAllContacts(ctx)
	if err != nil {
		fail(w, 500, err)
		return
	}
	for jid, c := range contacts {
		if jid.Server != types.DefaultUserServer {
			continue
		}
		name := a.displayName(ctx, jid)
		hay := strings.ToLower(strings.Join([]string{c.FullName, c.FirstName, c.PushName, c.BusinessName, jid.User}, " "))
		if strings.Contains(hay, q) {
			seen[jid.String()] = contactOut{JID: jid.String(), Name: name}
		}
	}
	chats, err := a.store.Chats(10000)
	if err != nil {
		fail(w, 500, err)
		return
	}
	for _, c := range chats {
		jid, err := types.ParseJID(c.JID)
		if err != nil {
			continue
		}
		name := a.displayName(ctx, jid)
		if strings.Contains(strings.ToLower(name+" "+jid.User), q) {
			seen[c.JID] = contactOut{JID: c.JID, Name: name, Group: c.IsGroup}
		}
	}
	out := make([]contactOut, 0, len(seen))
	for _, c := range seen {
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	if len(out) > 25 {
		out = out[:25]
	}
	reply(w, 200, out)
}

func (a *App) handleChats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	chats, err := a.store.Chats(10000)
	if err != nil {
		fail(w, 500, err)
		return
	}
	limit := limitOf(r, 20)
	out := make([]Chat, 0, limit)
	for _, c := range chats {
		jid, err := types.ParseJID(c.JID)
		if err != nil {
			continue
		}
		c.Name = a.displayName(ctx, jid)
		if q != "" && !strings.Contains(strings.ToLower(c.Name), q) {
			continue
		}
		out = append(out, c)
		if len(out) == limit {
			break
		}
	}
	reply(w, 200, out)
}

type messageOut struct {
	Message
	ChatName string `json:"chatName"`
}

func (a *App) handleMessages(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	query := r.URL.Query()
	msgs, err := a.store.Messages(MessageQuery{
		Chat: query.Get("chat"), Query: query.Get("q"),
		Before: int64Of(r, "before"), After: int64Of(r, "after"), Limit: limitOf(r, 30),
	})
	if err != nil {
		fail(w, 500, err)
		return
	}
	out := make([]messageOut, 0, len(msgs))
	for _, m := range msgs {
		o := messageOut{Message: m}
		if chat, err := types.ParseJID(m.Chat); err == nil {
			o.ChatName = a.displayName(ctx, chat)
		}
		if m.FromMe {
			o.SenderName = "me"
		} else if sender, err := types.ParseJID(m.Sender); err == nil {
			o.SenderName = a.displayName(ctx, sender)
		}
		out = append(out, o)
	}
	reply(w, 200, out)
}

type sendRequest struct {
	Chat    string `json:"chat"`
	Text    string `json:"text"`
	Path    string `json:"path"`
	Voice   bool   `json:"voice"`
	ReplyTo string `json:"replyTo"`
}

func parseChat(s string) (types.JID, error) {
	if strings.Contains(s, "@") {
		return types.ParseJID(s)
	}
	digits := strings.TrimLeft(strings.NewReplacer("+", "", " ", "", "-", "").Replace(s), "0")
	if digits == "" {
		return types.JID{}, errors.New("chat is required")
	}
	return types.NewJID(digits, types.DefaultUserServer), nil
}

func (a *App) handleSend(w http.ResponseWriter, r *http.Request) {
	var req sendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		fail(w, 400, err)
		return
	}
	to, err := parseChat(req.Chat)
	if err != nil {
		fail(w, 400, err)
		return
	}
	if req.Text == "" && req.Path == "" {
		fail(w, 400, errors.New("text or path is required"))
		return
	}
	state, _, _ := a.snapshot()
	if state != "connected" {
		fail(w, 503, errors.New("WhatsApp is not connected"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	var msg *waE2E.Message
	if req.Path == "" {
		msg = &waE2E.Message{Conversation: proto.String(req.Text)}
		if req.ReplyTo != "" {
			msg = &waE2E.Message{ExtendedTextMessage: &waE2E.ExtendedTextMessage{
				Text: proto.String(req.Text), ContextInfo: a.replyContext(ctx, to, req.ReplyTo),
			}}
		}
	} else if msg, err = a.mediaMessage(ctx, req); err != nil {
		fail(w, 500, err)
		return
	}
	resp, err := a.client.SendMessage(ctx, to, msg)
	if err != nil {
		fail(w, 502, err)
		return
	}
	text, mediaType, filename, _ := describe(msg)
	chat := a.normalize(ctx, to)
	_ = a.store.UpsertChat(chat.String(), "", to.Server == types.GroupServer, resp.Timestamp.UnixMilli())
	_ = a.store.PutMessage(Message{
		ID: resp.ID, Chat: chat.String(), Sender: a.client.Store.ID.ToNonAD().String(), FromMe: true,
		TS: resp.Timestamp.UnixMilli(), Text: text, MediaType: mediaType, Filename: filename,
	}, nil)
	reply(w, 200, map[string]string{"id": resp.ID})
}

func (a *App) replyContext(ctx context.Context, chat types.JID, id string) *waE2E.ContextInfo {
	info := &waE2E.ContextInfo{StanzaID: proto.String(id)}
	msgs, _ := a.store.Messages(MessageQuery{Chat: a.normalize(ctx, chat).String(), Limit: maxLimit})
	for _, m := range msgs {
		if m.ID == id {
			info.Participant = proto.String(m.Sender)
			info.QuotedMessage = &waE2E.Message{Conversation: proto.String(m.Text)}
		}
	}
	return info
}

type downloadRequest struct {
	Chat    string `json:"chat"`
	Message string `json:"message"`
}

func (a *App) handleDownload(w http.ResponseWriter, r *http.Request) {
	var req downloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Chat == "" || req.Message == "" {
		fail(w, 400, errors.New("chat and message are required"))
		return
	}
	raw, kind, err := a.store.Raw(req.Message, req.Chat)
	if err != nil || len(raw) == 0 {
		fail(w, 404, errors.New("that message has no media on this machine"))
		return
	}
	var msg waE2E.Message
	if err := proto.Unmarshal(raw, &msg); err != nil {
		fail(w, 500, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()
	data, err := a.client.DownloadAny(ctx, &msg)
	if err != nil {
		fail(w, 502, err)
		return
	}
	path := a.mediaPath(req.Chat, req.Message, extensionOf(&msg, kind))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		fail(w, 500, err)
		return
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		fail(w, 500, err)
		return
	}
	reply(w, 200, map[string]any{"path": path, "type": kind, "bytes": len(data)})
}
