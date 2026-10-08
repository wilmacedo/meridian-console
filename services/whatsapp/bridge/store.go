package main

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

type Store struct{ db *sql.DB }

type Chat struct {
	JID      string `json:"jid"`
	Name     string `json:"name"`
	IsGroup  bool   `json:"isGroup"`
	LastTS   int64  `json:"lastTs"`
	Preview  string `json:"preview"`
	LastMine bool   `json:"lastFromMe"`
}

type Message struct {
	ID         string `json:"id"`
	Chat       string `json:"chat"`
	Sender     string `json:"sender"`
	SenderName string `json:"senderName"`
	FromMe     bool   `json:"fromMe"`
	TS         int64  `json:"ts"`
	Text       string `json:"text"`
	MediaType  string `json:"mediaType,omitempty"`
	Filename   string `json:"filename,omitempty"`
	ReplyTo    string `json:"replyTo,omitempty"`
}

func openStore(path string) (*Store, error) {
	db, err := sql.Open("sqlite3", "file:"+path+"?_foreign_keys=on&_busy_timeout=5000&_journal_mode=WAL")
	if err != nil {
		return nil, err
	}
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS chats (
			jid TEXT PRIMARY KEY,
			name TEXT NOT NULL DEFAULT '',
			is_group INTEGER NOT NULL DEFAULT 0,
			last_ts INTEGER NOT NULL DEFAULT 0
		);
		CREATE TABLE IF NOT EXISTS messages (
			id TEXT NOT NULL,
			chat TEXT NOT NULL,
			sender TEXT NOT NULL DEFAULT '',
			from_me INTEGER NOT NULL DEFAULT 0,
			ts INTEGER NOT NULL,
			text TEXT NOT NULL DEFAULT '',
			media_type TEXT NOT NULL DEFAULT '',
			filename TEXT NOT NULL DEFAULT '',
			reply_to TEXT NOT NULL DEFAULT '',
			raw BLOB,
			PRIMARY KEY (id, chat)
		);
		CREATE INDEX IF NOT EXISTS messages_chat_ts ON messages (chat, ts);
	`)
	if err != nil {
		return nil, err
	}
	return &Store{db}, nil
}

func (s *Store) UpsertChat(jid, name string, isGroup bool, ts int64) error {
	_, err := s.db.Exec(`
		INSERT INTO chats (jid, name, is_group, last_ts) VALUES (?, ?, ?, ?)
		ON CONFLICT(jid) DO UPDATE SET
			name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE chats.name END,
			last_ts = MAX(chats.last_ts, excluded.last_ts)`,
		jid, name, isGroup, ts)
	return err
}

func (s *Store) PutMessage(m Message, raw []byte) error {
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO messages (id, chat, sender, from_me, ts, text, media_type, filename, reply_to, raw)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, m.Chat, m.Sender, m.FromMe, m.TS, m.Text, m.MediaType, m.Filename, m.ReplyTo, raw)
	return err
}

func (s *Store) Raw(id, chat string) ([]byte, string, error) {
	var raw []byte
	var kind string
	err := s.db.QueryRow(`SELECT raw, media_type FROM messages WHERE id = ? AND chat = ?`, id, chat).Scan(&raw, &kind)
	return raw, kind, err
}

func (s *Store) ChatName(jid string) (string, bool) {
	var name string
	var group bool
	if err := s.db.QueryRow(`SELECT name, is_group FROM chats WHERE jid = ?`, jid).Scan(&name, &group); err != nil {
		return "", false
	}
	return name, group
}

func (s *Store) Chats(limit int) ([]Chat, error) {
	rows, err := s.db.Query(`
		SELECT c.jid, c.name, c.is_group, c.last_ts,
			COALESCE((SELECT text FROM messages m WHERE m.chat = c.jid ORDER BY ts DESC LIMIT 1), ''),
			COALESCE((SELECT media_type FROM messages m WHERE m.chat = c.jid ORDER BY ts DESC LIMIT 1), ''),
			COALESCE((SELECT from_me FROM messages m WHERE m.chat = c.jid ORDER BY ts DESC LIMIT 1), 0)
		FROM chats c ORDER BY c.last_ts DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Chat
	for rows.Next() {
		var c Chat
		var media string
		if err := rows.Scan(&c.JID, &c.Name, &c.IsGroup, &c.LastTS, &c.Preview, &media, &c.LastMine); err != nil {
			return nil, err
		}
		if c.Preview == "" && media != "" {
			c.Preview = "[" + media + "]"
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

type MessageQuery struct {
	Chat   string
	Query  string
	Before int64
	After  int64
	Limit  int
}

// Newest first from the database, returned oldest first so a conversation reads top to bottom.
func (s *Store) Messages(q MessageQuery) ([]Message, error) {
	var where []string
	var args []any
	if q.Chat != "" {
		where = append(where, "chat = ?")
		args = append(args, q.Chat)
	}
	if q.Query != "" {
		where = append(where, "text LIKE ? ESCAPE '\\'")
		args = append(args, "%"+escapeLike(q.Query)+"%")
	}
	if q.Before > 0 {
		where = append(where, "ts < ?")
		args = append(args, q.Before)
	}
	if q.After > 0 {
		where = append(where, "ts >= ?")
		args = append(args, q.After)
	}
	sqlText := `SELECT id, chat, sender, from_me, ts, text, media_type, filename, reply_to FROM messages`
	if len(where) > 0 {
		sqlText += " WHERE " + strings.Join(where, " AND ")
	}
	sqlText += fmt.Sprintf(" ORDER BY ts DESC LIMIT %d", q.Limit)
	rows, err := s.db.Query(sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.Chat, &m.Sender, &m.FromMe, &m.TS, &m.Text, &m.MediaType, &m.Filename, &m.ReplyTo); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, rows.Err()
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}
