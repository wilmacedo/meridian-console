import type { ServiceSummary } from '@meridian/service-sdk'
import { ID_PATTERN } from '../managed-services.js'
import { fail, object, text } from './fields.js'

// What a routine does when it runs, one step after another. Each kind is one entry of STEP_KINDS: a new kind
// is a new entry (and a line in NOX's persona so it knows how to write one), nothing else.

interface BaseStep {
  id: string
  title: string
}

// A read-only service action the server runs itself, without the model: cheap, and its result goes to the
// worker as data.
export interface ActionStep extends BaseStep {
  kind: 'action'
  service: string
  action: string
  input?: Record<string, unknown>
}

// An instruction in the owner's words that the routine's worker carries out with NOX's tools.
export interface PromptStep extends BaseStep {
  kind: 'prompt'
  prompt: string
}

export type Step = ActionStep | PromptStep

const BASE = ['id', 'kind', 'title']
const MAX_PROMPT = 1000

export const STEP_KINDS: Record<Step['kind'], (raw: unknown, path: string, services: ServiceSummary[]) => Step> = {
  action: (raw, path, services) => {
    const r = object(raw, path, [...BASE, 'service', 'action', 'input'])
    const service = services.find((s) => s.id === text(r, 'service', path, 40)) ?? fail(`${path}: no service "${String(r.service)}"; get_status lists them`)
    const action = service.actions.find((a) => a.id === text(r, 'action', path, 60)) ?? fail(`${path}: service ${service.id} has no action "${String(r.action)}"`)
    // A routine only reads: what changes something is asked for in the conversation, where the owner confirms it.
    if (action.mutating || action.gated) fail(`${path}: ${service.id}/${action.id} can change something, and a routine only reads; leave it out or make it a prompt step that reports instead`)
    if (r.input !== undefined && (typeof r.input !== 'object' || r.input === null || Array.isArray(r.input))) fail(`${path}.input must be an object`)
    return { ...base(r, path), kind: 'action', service: service.id, action: action.id, ...(r.input ? { input: r.input as Record<string, unknown> } : {}) }
  },
  prompt: (raw, path) => {
    const r = object(raw, path, [...BASE, 'prompt'])
    return { ...base(r, path), kind: 'prompt', prompt: text(r, 'prompt', path, MAX_PROMPT) }
  },
}

function base(r: Record<string, unknown>, path: string): BaseStep {
  const id = text(r, 'id', path, 40)
  if (!ID_PATTERN.test(id)) fail(`${path}.id must be kebab-case`)
  return { id, title: text(r, 'title', path, 60) }
}

export function validateStep(raw: unknown, path: string, services: ServiceSummary[]): Step {
  const kind = (raw as { kind?: unknown } | null)?.kind
  const validate = typeof kind === 'string' && Object.hasOwn(STEP_KINDS, kind) ? STEP_KINDS[kind as Step['kind']] : undefined
  if (!validate) fail(`${path}.kind must be one of ${Object.keys(STEP_KINDS).join(', ')}`)
  return validate!(raw, path, services)
}
