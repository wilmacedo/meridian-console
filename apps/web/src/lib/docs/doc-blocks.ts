import type { Tone } from '@meridian/service-sdk'

export type { DocBlock, DocSpec, Tone } from '@meridian/service-sdk'

const TONES: Record<Tone, string> = {
  ok: '#3fd68b',
  warn: '#ffd34d',
  bad: '#ff6b8a',
  accent: 'rgb(var(--nx-ac))',
  fg: 'rgb(var(--nx-fg))',
  dim: 'rgba(var(--nx-ac), 0.7)',
}

export const toneColor = (tone: Tone | undefined, fallback: Tone): string => TONES[tone ?? fallback]
