// Talks to NOX without a microphone: the same entry point voice will use.
//
//   pnpm nox "abre a telemetria" [--workspace <id>]
//
// Needs the server running (pnpm dev:server). What NOX says streams to stdout; the tools it calls go to stderr.
const args = process.argv.slice(2)
const wsAt = args.indexOf('--workspace')
const workspace = wsAt >= 0 ? args.splice(wsAt, 2)[1] : undefined
const text = args.join(' ').trim()
if (!text) {
  console.error('usage: pnpm nox "what to say" [--workspace <id>]')
  process.exit(1)
}

const base = `http://localhost:${process.env.PORT ?? 4000}`
const res = await fetch(`${base}/api/nox/say`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, workspace }) }).catch(() => undefined)
if (!res?.ok || !res.body) {
  console.error(res ? `server answered ${res.status}` : `cannot reach the server at ${base}; is pnpm dev:server running?`)
  process.exit(1)
}

type Event = { type: 'text'; text: string } | { type: 'tool'; name: string } | { type: 'done' } | { type: 'error'; message: string }

const decoder = new TextDecoder()
let buffer = ''
let failed = false
for await (const chunk of res.body) {
  buffer += decoder.decode(chunk, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''
  for (const line of lines.filter(Boolean)) {
    const event = JSON.parse(line) as Event
    if (event.type === 'text') process.stdout.write(event.text)
    else if (event.type === 'tool') console.error(`\n[tool] ${event.name}`)
    else if (event.type === 'error') {
      console.error(`\n[error] ${event.message}`)
      failed = true
    }
  }
}
process.stdout.write('\n')
process.exit(failed ? 1 : 0)
