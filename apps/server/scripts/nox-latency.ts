// Latency spike for NOX's engine: headless Claude Code on the subscription.
//
//   pnpm --filter @meridian/server nox:latency [variant ...] [--model <alias>] [--n <prompts>]
//
// Variants: default (Claude Code as shipped), slim (own system prompt, no tools, no user settings),
// persistent (slim, one long-lived process fed turn by turn). Every call spends subscription usage.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'

const PROMPTS = [
  'abre a telemetria',
  'como está o servidor?',
  'mostra os logs do aqw-idle',
  'fixa a telemetria na lateral',
  'quantos serviços estão online?',
  'fecha todas as janelas',
  'resume o que aconteceu hoje nos eventos',
  'muda o tema para escuro',
  'faz um relatório de status',
  'o que você consegue fazer?',
]

const STYLE = 'Você é NOX, a assistente de voz de um homelab. Responda em português do Brasil, em no máximo duas frases curtas, sem markdown.'

interface Turn {
  prompt: string
  // ms from sending the prompt
  firstEvent: number
  firstToken: number
  firstSentence: number
  total: number
  chars: number
  inputTokens: number
  cacheReadTokens: number
  outputTokens: number
  costUsd: number
}

const SENTENCE_END = /[.!?…](\s|$)/

interface Clock {
  start: number
  firstEvent?: number
  firstToken?: number
  firstSentence?: number
  text: string
}

interface StreamLine {
  type?: string
  event?: { type?: string; delta?: { type?: string; text?: string } }
  usage?: { input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number }
  total_cost_usd?: number
}

// Folds one stream-json line into the clock; returns the final turn once `result` arrives.
function observe(clock: Clock, line: string, prompt: string): Turn | undefined {
  let msg: StreamLine
  try {
    msg = JSON.parse(line) as StreamLine
  } catch {
    return undefined
  }
  const now = performance.now() - clock.start
  clock.firstEvent ??= now
  if (msg.type === 'stream_event' && msg.event?.type === 'content_block_delta' && msg.event.delta?.type === 'text_delta') {
    clock.firstToken ??= now
    clock.text += msg.event.delta.text ?? ''
    if (clock.firstSentence === undefined && SENTENCE_END.test(clock.text)) clock.firstSentence = now
  }
  if (msg.type === 'result') {
    const u = msg.usage ?? {}
    return {
      prompt,
      firstEvent: clock.firstEvent,
      firstToken: clock.firstToken ?? now,
      firstSentence: clock.firstSentence ?? now,
      total: now,
      chars: clock.text.length,
      inputTokens: u.input_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      costUsd: msg.total_cost_usd ?? 0,
    }
  }
  return undefined
}

const BASE = ['-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--no-session-persistence']
const SLIM = ['--system-prompt', STYLE, '--tools', '', '--setting-sources', '', '--disable-slash-commands', '--strict-mcp-config']
// dontAsk denies every tool call that has no allow rule, so the default variant can't touch anything.
const DEFAULT = ['--permission-mode', 'dontAsk', '--append-system-prompt', STYLE]

function oneShot(args: string[], prompt: string, cwd: string): Promise<Turn> {
  return new Promise((resolve, reject) => {
    const clock: Clock = { start: performance.now(), text: '' }
    const child = spawn('claude', [...BASE, ...args, prompt], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    createInterface({ input: child.stdout }).on('line', (line) => {
      const turn = observe(clock, line, prompt)
      if (turn) resolve(turn)
    })
    child.on('error', reject)
    child.on('close', (code) => code && reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`)))
  })
}

async function persistent(args: string[], prompts: string[], cwd: string): Promise<Turn[]> {
  const child = spawn('claude', [...BASE, '--input-format', 'stream-json', ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
  const turns: Turn[] = []
  for (const prompt of prompts) {
    const clock: Clock = { start: performance.now(), text: '' }
    child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } })}\n`)
    for (;;) {
      const { value, done } = await lines.next()
      if (done) throw new Error('claude closed its output early')
      const turn = observe(clock, value, prompt)
      if (turn) {
        turns.push(turn)
        break
      }
    }
  }
  child.stdin.end()
  return turns
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const ms = (v: number): string => `${Math.round(v)}`.padStart(6)

function report(name: string, turns: Turn[]): void {
  console.log(`\n== ${name} (${turns.length} turns), ms from sending the prompt`)
  console.log('first-event  first-token  first-sentence  total   in/cache/out tokens  prompt')
  for (const t of turns) {
    console.log(`${ms(t.firstEvent)}      ${ms(t.firstToken)}      ${ms(t.firstSentence)}        ${ms(t.total)}  ${`${t.inputTokens}/${t.cacheReadTokens}/${t.outputTokens}`.padEnd(18)}  ${t.prompt}`)
  }
  const col = (f: (t: Turn) => number): number => median(turns.map(f))
  console.log(`median:     ${ms(col((t) => t.firstEvent))}      ${ms(col((t) => t.firstToken))}      ${ms(col((t) => t.firstSentence))}        ${ms(col((t) => t.total))}`)
  const sum = (f: (t: Turn) => number): number => turns.reduce((a, t) => a + f(t), 0)
  console.log(`per turn:   input ${Math.round(sum((t) => t.inputTokens) / turns.length)}, cache-read ${Math.round(sum((t) => t.cacheReadTokens) / turns.length)}, output ${Math.round(sum((t) => t.outputTokens) / turns.length)} tokens, ~$${(sum((t) => t.costUsd) / turns.length).toFixed(4)} (API-equivalent)`)
}

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
const model = flag('--model') ?? 'sonnet'
const effort = flag('--effort')
const tuning = ['--model', model, ...(effort ? ['--effort', effort] : [])]
const count = Number(flag('--n') ?? PROMPTS.length)
const variants = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'))
const wanted = variants.length ? variants : ['default', 'slim', 'persistent']
const prompts = PROMPTS.slice(0, count)

// A directory with no CLAUDE.md, like NOX's own home will be, so the repo's rules don't leak in.
const cwd = '/tmp/nox-spike'
mkdirSync(cwd, { recursive: true })

async function sequence(args: string[]): Promise<Turn[]> {
  const out: Turn[] = []
  for (const p of prompts) out.push(await oneShot([...tuning, ...args], p, cwd))
  return out
}

console.log(`model: ${model}, effort: ${effort ?? 'default'}, prompts: ${prompts.length}`)
if (wanted.includes('default')) report('default', await sequence(DEFAULT))
if (wanted.includes('slim')) report('slim', await sequence(SLIM))
if (wanted.includes('persistent')) report('persistent (slim, one process)', await persistent([...tuning, ...SLIM], prompts, cwd))
