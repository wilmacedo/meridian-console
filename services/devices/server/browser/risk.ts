// What the browser may touch and what needs the owner first. Ported from services/browser-harness/gateway/policy.py:
// the agent decides where to act, this decides whether that needs the owner. When unsure, it asks.

export interface ElementFacts {
  name?: string
  role?: string
  type?: string
  autocomplete?: string
  id?: string
  isSubmit?: boolean
  formSearch?: boolean
  inForm?: boolean
  inDialog?: boolean
  editable?: boolean
  hrefPath?: string
}

export function hostAllowed(host: string | undefined, allowed: readonly string[]): boolean {
  const h = (host ?? '').toLowerCase()
  if (allowed.includes('*')) return h !== ''
  return allowed.some((d) => h === d || h.endsWith(`.${d}`))
}

// A sign-in page on an allowed host: the owner has to sign in, the agent never touches it.
const LOGIN_PATH = /^\/(login|signin|sign-in|sign_in|auth|sso)(\/|$)/i

export type UrlState = 'ready' | 'needs_login' | 'blocked'

export function classifyUrl(url: string, allowed: readonly string[]): UrlState {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'blocked'
  }
  if (u.protocol !== 'https:' || !hostAllowed(u.hostname, allowed)) return 'blocked'
  return LOGIN_PATH.test(u.pathname) ? 'needs_login' : 'ready'
}

const RISKY_VERBS = new RegExp(
  '\\b(' +
    [
      'delete|remove|discard|erase|destroy|revoke|terminate|unlink|disconnect|deactivate|disable|unsubscribe|unpublish',
      'submit|resubmit|send|publish|post|release|upload|import',
      'buy|purchase|pay|checkout|order|subscribe|upgrade|renew|donate',
      'accept|agree|approve|authorize|allow|grant|confirm',
      'save|apply|update|change|reset|rename|transfer|withdraw|invite|add|create|enable|request|report|block',
      'sign out|sign off|log out|logout',
      'excluir|apagar|remover|descartar|revogar|desativar|desconectar|cancelar assinatura',
      'enviar|publicar|postar|liberar|reenviar',
      'comprar|pagar|assinar|renovar|doar',
      'aceitar|concordo|concordar|aprovar|autorizar|permitir|confirmar',
      'salvar|aplicar|atualizar|alterar|redefinir|renomear|transferir|sacar|convidar|adicionar|criar|ativar|solicitar|bloquear',
      'sair',
    ].join('|') +
    ')\\b',
)
// "Cancel" or "Close" alone just leave a dialog; "Cancel Submission" does not.
const CANCEL_SOMETHING = /^(cancel|cancelar)\s+\S/
const HARMLESS = new Set(['cancel', 'cancelar', 'close', 'fechar', 'dismiss', 'back', 'voltar', 'no', 'nao', 'not now', 'agora nao', 'later', 'skip', 'learn more', 'show more', 'show less', 'expand', 'collapse', 'search', 'buscar', 'pesquisar'])
// In a dialog these mean "go ahead".
const AFFIRMATIVE = new Set(['yes', 'ok', 'okay', 'continue', 'done', 'got it', 'proceed', 'sim', 'continuar', 'concluir', 'entendi', 'prosseguir'])
const RISKY_PATH = /\/(delete|remove|logout|signout|sign-out|cancel|revoke|unsubscribe|purchase|buy|checkout)(\/|$|-|_)/i
const TOGGLES = new Set(['checkbox', 'radio', 'switch'])

export const norm = (text: string | undefined): string =>
  (text ?? '')
    .toLowerCase()
    .replace(/ /g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Why clicking this element needs the owner's confirmation, or undefined when it is safe to just do.
export function riskOfTarget(f: ElementFacts): string | undefined {
  const name = norm(f.name)
  if (HARMLESS.has(name) && !f.isSubmit) return undefined
  if (CANCEL_SOMETHING.test(name)) return `cancels something ("${f.name}")`
  const verb = RISKY_VERBS.exec(name)
  if (verb) return `its label says "${verb[1]}" ("${f.name}")`
  if (f.isSubmit && !f.formSearch) return 'it submits a form'
  if (f.role && TOGGLES.has(f.role)) return 'it flips a setting'
  if (f.inDialog && AFFIRMATIVE.has(name)) return 'it confirms a dialog'
  if (f.role === 'link' && RISKY_PATH.test(f.hrefPath ?? '')) return 'its address looks like a destructive action'
  return undefined
}

const ALLOWED_KEYS = new Set(['Enter', 'Tab', 'Escape', ' ', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Backspace', 'Delete'])
const ACTIVATES = new Set(['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'option', 'combobox'])

export const keyAllowed = (key: string): boolean => ALLOWED_KEYS.has(key)

// Same question for a key press; `active` are the facts of the focused element.
export function riskOfKey(key: string, active: ElementFacts): string | undefined {
  if (key !== 'Enter' && key !== ' ' && key !== 'Space') return undefined
  if (active.role && ACTIVATES.has(active.role) && !active.editable) return riskOfTarget(active)
  if (key === 'Enter' && active.editable && active.inForm && !active.formSearch && active.type !== 'search') return 'Enter inside a form submits it'
  return undefined
}

const SECRET_FIELD = /password|passwd|senha|one-time-code|cc-|credit|card number|cvv|cvc/i

// A reason not to type into this field at all: the owner signs in, not the agent.
export function refuseTyping(f: ElementFacts): string | undefined {
  if ((f.type ?? '').toLowerCase() === 'password' || SECRET_FIELD.test([f.autocomplete, f.name, f.id].filter(Boolean).join(' '))) {
    return 'it is a password, code or card field; the owner enters those, never the agent'
  }
  if (!f.editable) return 'it is not a text field'
  return undefined
}
