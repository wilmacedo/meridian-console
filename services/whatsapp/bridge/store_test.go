package main

import (
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := openStore(filepath.Join(t.TempDir(), "messages.db"))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func put(t *testing.T, s *Store, id, chat, text string, ts int64) {
	t.Helper()
	if err := s.UpsertChat(chat, "", false, ts); err != nil {
		t.Fatal(err)
	}
	if err := s.PutMessage(Message{ID: id, Chat: chat, TS: ts, Text: text}, nil); err != nil {
		t.Fatal(err)
	}
}

func TestMessagesComeBackOldestFirstAndKeepTheNewest(t *testing.T) {
	s := newTestStore(t)
	for i, text := range []string{"a", "b", "c", "d"} {
		put(t, s, text, "x@s.whatsapp.net", text, int64(i+1)*1000)
	}
	got, err := s.Messages(MessageQuery{Chat: "x@s.whatsapp.net", Limit: 3})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || got[0].Text != "b" || got[2].Text != "d" {
		t.Fatalf("want b,c,d got %+v", got)
	}
}

func TestSearchTreatsWildcardsAsText(t *testing.T) {
	s := newTestStore(t)
	put(t, s, "1", "x@s.whatsapp.net", "100% sure", 1000)
	put(t, s, "2", "x@s.whatsapp.net", "1000 sure", 2000)
	got, err := s.Messages(MessageQuery{Query: "100%", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "1" {
		t.Fatalf("want only message 1, got %+v", got)
	}
}

func TestTimeBounds(t *testing.T) {
	s := newTestStore(t)
	for i := int64(1); i <= 5; i++ {
		put(t, s, string(rune('a'+i)), "x@s.whatsapp.net", "m", i*1000)
	}
	got, _ := s.Messages(MessageQuery{After: 2000, Before: 5000, Limit: 10})
	if len(got) != 3 {
		t.Fatalf("want 3 messages in [2000,5000), got %d", len(got))
	}
}

func TestChatsKeepTheLatestTimeAndPreview(t *testing.T) {
	s := newTestStore(t)
	put(t, s, "1", "x@s.whatsapp.net", "old", 1000)
	put(t, s, "2", "x@s.whatsapp.net", "new", 3000)
	put(t, s, "3", "y@s.whatsapp.net", "other", 2000)
	chats, err := s.Chats(10)
	if err != nil || len(chats) != 2 {
		t.Fatalf("chats: %v %+v", err, chats)
	}
	if chats[0].JID != "x@s.whatsapp.net" || chats[0].Preview != "new" {
		t.Fatalf("want x first with preview new, got %+v", chats[0])
	}
}
