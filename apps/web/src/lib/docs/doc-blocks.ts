export type Tone = 'ok' | 'warn' | 'bad' | 'accent' | 'fg' | 'dim'

export type DocBlock =
  | { t: 'h'; level?: 1 | 2; text: string; eyebrow?: string }
  | { t: 'p'; text: string }
  | { t: 'stats'; items: { label: string; value: string | number; unit?: string; note?: string; tone?: Tone }[] }
  | { t: 'progress'; items: { label: string; value: number; detail?: string; tone?: Tone }[] }
  | { t: 'table'; cols: { label: string; align?: 'left' | 'right'; w?: string }[]; rows: (string | { v: string; tone?: Tone })[][] }
  | { t: 'list'; items: { text: string; meta?: string; state?: 'done' | 'active' | 'todo' }[] }
  | { t: 'callout'; tone?: Tone; title?: string; text: string }
  | { t: 'kv'; items: { k: string; v: string; tone?: Tone }[] }
  | { t: 'code'; lang?: string; text: string }
  | { t: 'tags'; items: { label: string; tone?: Tone }[] }
  | { t: 'divider' }

export interface DocSpec {
  title: string
  kicker: string
  blocks: DocBlock[]
}

const TONES: Record<Tone, string> = {
  ok: '#3fd68b',
  warn: '#ffd34d',
  bad: '#ff6b8a',
  accent: 'rgb(var(--nx-ac))',
  fg: 'rgb(var(--nx-fg))',
  dim: 'rgba(var(--nx-ac), 0.7)',
}

export const toneColor = (tone: Tone | undefined, fallback: Tone): string => TONES[tone ?? fallback]
