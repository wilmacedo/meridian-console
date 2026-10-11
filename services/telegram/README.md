# telegram

Sends the owner messages from their own Telegram bot. A message from a bot is someone else's, so the phone notifies;
a note in the owner's own WhatsApp chat (`whatsapp`'s `note-to-self`) arrives without a sound, because WhatsApp never
notifies an account of its own messages. This is the channel Meridian's reminders use to reach the owner away from
the screens.

Send-only. The same bot may be read by another program (n8n, through a webhook or by polling), so this service never
calls `getUpdates` or touches the webhook: either would take the bot's incoming messages away from it.

## Setup

1. Use an existing bot or create one with [@BotFather](https://t.me/BotFather) (`/newbot`); it gives the token.
2. The chat id is the owner's own user id, as a number. Send the bot any message first, so it is allowed to write
   back.
3. Put both in `.env` and restart the server. The service shows `online` with the bot's `@username`.

| Variable | Meaning |
|---|---|
| `TELEGRAM_BOT_TOKEN` | The bot's token. Never printed: errors carry Telegram's reason, not the URL that holds the token |
| `TELEGRAM_CHAT_ID` | The owner's chat id. The only chat this service ever writes to |

## NOX's tools

| Action | Kind | What it does |
|---|---|---|
| `notify-owner {text}` | none | A message of up to 1000 characters to the owner. There is no recipient to choose. At most 3 a minute and 10 an hour |

For reminders, NOX points the `note` channel at it (`configure_reminders` with `{"service": "telegram", "action":
"notify-owner"}`): it is used when no screen is open and for the one repeat of a reminder nobody answered.
