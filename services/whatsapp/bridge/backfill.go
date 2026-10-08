package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"go.mau.fi/whatsmeow/types"
)

const (
	backfillBatch   = 50 // what whatsmeow recommends asking for at a time
	backfillRounds  = 60
	backfillWait    = 25 * time.Second
	backfillBudget  = 2 * time.Minute
	defaultMaxAdded = 500
	hardMaxAdded    = 3000
)

type backfillRequest struct {
	Chat  string `json:"chat"`
	Since int64  `json:"since"`
	Max   int    `json:"max"`
}

type backfillResult struct {
	Added        int    `json:"added"`
	Oldest       int64  `json:"oldest"`
	ReachedStart bool   `json:"reachedStart"`
	Stopped      string `json:"stopped"`
}

// Asks the phone for messages older than the oldest one known, round after round, until the wanted date is
// covered, the start of the chat is reached, the cap is hit, or the phone stops answering.
func (a *App) backfill(ctx context.Context, chat types.JID, since int64, max int) (backfillResult, error) {
	a.backfilling.Lock()
	defer a.backfilling.Unlock()
	chatID := chat.String()
	before := a.store.Count(chatID)
	if _, ok := a.store.Oldest(chatID); !ok {
		return backfillResult{}, errors.New("no message of this chat is known yet, so there is nothing to ask the phone to go back from")
	}
	select {
	case <-a.onDemand:
	default:
	}

	result := backfillResult{}
	// WhatsApp may know the chat under its LID rather than the phone number, so a round that brings nothing is
	// retried once under the other name before the start of the chat is assumed.
	var names []types.JID
	names = append(names, chat)
	if lid, err := a.client.Store.LIDs.GetLIDForPN(ctx, chat); err == nil && !lid.IsEmpty() {
		names = append(names, lid)
	}
	nameAt := 0

	for round := 0; round < backfillRounds; round++ {
		oldest, _ := a.store.Oldest(chatID)
		result.Oldest = oldest.TS
		result.Added = a.store.Count(chatID) - before
		switch {
		case since > 0 && oldest.TS <= since:
			result.Stopped = "covered the period asked for"
			return result, nil
		case result.Added >= max:
			result.Stopped = "reached the cap on messages for one request"
			return result, nil
		}

		info := &types.MessageInfo{
			MessageSource: types.MessageSource{Chat: names[nameAt], IsFromMe: oldest.FromMe},
			ID:            oldest.ID,
			Timestamp:     time.UnixMilli(oldest.TS),
		}
		if _, err := a.client.SendPeerMessage(ctx, a.client.BuildHistorySyncRequest(info, backfillBatch)); err != nil {
			return result, err
		}
		select {
		case <-a.onDemand:
		case <-time.After(backfillWait):
			result.Stopped = "the phone did not answer (it may be offline); try again when it is on"
			return result, nil
		case <-ctx.Done():
			result.Stopped = "ran out of time; ask again to go further back"
			return result, nil
		}

		if next, _ := a.store.Oldest(chatID); next.TS >= oldest.TS {
			if nameAt+1 < len(names) {
				nameAt++
				continue
			}
			result.ReachedStart = true
			result.Stopped = "reached the start of the chat"
			return result, nil
		}
	}
	oldest, _ := a.store.Oldest(chatID)
	result.Oldest, result.Added = oldest.TS, a.store.Count(chatID)-before
	result.Stopped = "ran out of rounds; ask again to go further back"
	return result, nil
}

func (a *App) handleBackfill(w http.ResponseWriter, r *http.Request) {
	var req backfillRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		fail(w, 400, err)
		return
	}
	jid, err := parseChat(req.Chat)
	if err != nil {
		fail(w, 400, err)
		return
	}
	if state, _, _ := a.snapshot(); state != "connected" {
		fail(w, 503, errors.New("WhatsApp is not connected"))
		return
	}
	max := req.Max
	if max < 1 {
		max = defaultMaxAdded
	}
	ctx, cancel := context.WithTimeout(r.Context(), backfillBudget)
	defer cancel()
	result, err := a.backfill(ctx, a.normalize(ctx, jid), req.Since, min(max, hardMaxAdded))
	if err != nil {
		fail(w, 502, err)
		return
	}
	reply(w, 200, result)
}
