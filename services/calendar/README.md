# calendar

Google Calendar for every account the owner connects (personal, work), shown as one calendar in the Calendar
window and the `Today` dock widget, and operated by voice through NOX. The window only reads; creating, changing
and deleting events is done by asking NOX.

## Setup

1. In the [Google Cloud Console](https://console.cloud.google.com) create a project and enable the **Google
   Calendar API**.
2. **Google Auth Platform**: audience *External*, then publish it (**In production**). In *Testing* a refresh token
   expires after 7 days. An unverified app shows a warning screen; for an app with a handful of users, *Advanced →
   continue* is enough.
3. **Clients → Create client → Web application.** Under *Authorized redirect URIs* add
   `https://<address>/api/services/calendar/oauth/callback` for every address Meridian is opened from (for
   example the custom domain and the `*.ts.net` name).
4. Put the client in `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `CALENDAR_TOKEN_KEY`
   (`openssl rand -base64 32`). Restart the server.
5. Open the Calendar window and press **CONNECT CALENDAR**. Sign in on Google's page; the tab closes itself and the
   account's calendars appear. Repeat for each account.

A Google Workspace admin can block third-party apps for the whole organisation; the consent screen then says
so, and the admin has to allow the client ID.

| Variable | Meaning |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The OAuth client from step 3 |
| `CALENDAR_TOKEN_KEY` | 32 random bytes, base64. Encrypts the stored refresh tokens (AES-256-GCM). Losing or changing it means signing the accounts in again |
| `CALENDAR_REDIRECT_URI` | Optional. Pins the redirect URI; by default it follows the address the page was opened from (`X-Forwarded-Host`) |
| `MERIDIAN_DATA_DIR` | Where `calendar.db` lives (default `~/.meridian`) |

Scopes asked: `calendar.events` and `calendar.calendarlist.readonly`.

## How it works

- **Storage.** `calendar.db` (the service's own SQLite file) keeps the accounts, with their refresh token encrypted,
  and one row per calendar: its hue, whether it is shown (for every screen and for NOX alike) and which one is the
  default for new events. Events are not stored; they are read from Google on demand and cached for a minute.
- **Calendars.** A new account's calendars start shown only when the owner can write to them, so shared holiday and
  birthday calendars do not bury the real ones. Each gets its own hue, from golden-angle steps over the colour wheel.
- **One invitation, shown once.** An invitation held by two accounts is merged by its `iCalUID` and start time; the
  first account to connect owns it, and the detail card says where else it is.
- **Recurring events** arrive as single occurrences; changing or deleting one touches only that occurrence.
- **Expired sign-in.** When Google revokes an account's grant, it becomes `PENDING` (its calendars stay listed), the
  service reports `degraded` naming it, one error lands in the event stream, and the other accounts keep working.
  Clicking the row in the sources list signs it in again.
- **The window learns of changes** by polling `/sources`, whose `rev` moves on every sign-in, visibility change and
  write, so an event NOX creates shows up within seconds.

## NOX's tools

| Action | Kind | What it does |
|---|---|---|
| `list-calendars` | read | Calendars, accounts, shown / writable / default |
| `list-events {from?, to?, calendars?}` | read | Merged events; a bare date covers that whole day in this machine's time zone. `when` is already in local time |
| `create-event {title, start/end or date/endDate, location?, calendar?}` | confirms | Timed events need a UTC offset; all-day use `date` (and `endDate`, inclusive) |
| `update-event {id, ...}` | confirms | Moving a timed event needs both `start` and `end` |
| `delete-event {id}` | confirms | By the id `list-events` returned |
| `configure-calendar {calendar, visible?, hue?, default?}` | none | Only changes what Meridian shows |

"Confirms" means the owner approves on the screen before it runs. A write can still be refused by Google (a
read-only calendar, a Workspace policy); NOX relays the reason.

## HTTP

Under `/api/services/calendar`: `GET /oauth/start[?account=<id>]`, `GET /oauth/callback`, `GET /sources`,
`PATCH /sources/:id`, `DELETE /accounts/:id` (revokes the token at Google), `GET /events?from&to` (ISO times, at most
62 days).

## Limits

Google only; no attendees, rooms or reminders; series-wide recurrence edits; no push notifications (the host is
reachable only inside the tailnet, so Google cannot call back). The grid starts at 06:00, as in the design, so an
earlier event shows in the agenda but not in the grid.
