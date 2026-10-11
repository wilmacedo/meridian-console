import { describe, expect, it } from 'vitest'
import { classifyUrl, hostAllowed, keyAllowed, refuseTyping, riskOfKey, riskOfTarget } from './risk.js'

const el = (name: string, extra: Record<string, unknown> = {}) => ({ name, role: 'button', ...extra })

describe('urls', () => {
  const allowed = ['example.com']
  it('classifies a page by host, scheme and sign-in path', () => {
    expect(classifyUrl('https://example.com/apps', allowed)).toBe('ready')
    expect(classifyUrl('https://x.example.com/', allowed)).toBe('ready')
    expect(classifyUrl('https://evilexample.com/', allowed)).toBe('blocked')
    expect(classifyUrl('http://example.com/', allowed)).toBe('blocked')
    expect(classifyUrl('javascript:alert(1)', allowed)).toBe('blocked')
    expect(classifyUrl('https://example.com/login?next=%2F', allowed)).toBe('needs_login')
    expect(classifyUrl('https://example.com/loginhelp', allowed)).toBe('ready')
    expect(classifyUrl('https://evil.test/login', allowed)).toBe('blocked')
  })

  it('lets the wildcard allow any https host, but not an empty one', () => {
    expect(hostAllowed('www.youtube.com', ['*'])).toBe(true)
    expect(hostAllowed('', ['*'])).toBe(false)
    expect(hostAllowed(undefined, ['*'])).toBe(false)
    expect(classifyUrl('https://www.youtube.com/login', ['*'])).toBe('needs_login')
  })
})

describe('riskOfTarget', () => {
  it('lets reading and navigating labels through', () => {
    for (const n of ['Distribution', 'Edit', 'Cancel', 'Close', 'Search', 'Show more', 'Reply', 'Messages']) expect(riskOfTarget(el(n)), n).toBeUndefined()
  })

  it('asks for labels that send, publish, delete, buy, accept or change, in English and Portuguese', () => {
    for (const n of ['Resubmit to App Review', 'Submit for Review', 'Delete Draft', 'Send', 'Publish', 'Buy now', 'Accept', 'I Agree', 'Save', 'Sign Out', 'Cancel Submission', 'Enviar', 'Excluir', 'Cancelar assinatura', 'Confirmar', 'Salvar', 'Apagar rascunho']) {
      expect(riskOfTarget(el(n)), n).toBeDefined()
    }
  })

  it('ignores accents and case', () => {
    expect(riskOfTarget(el('EXCLUÍR'))).toBeDefined()
    expect(riskOfTarget(el('  Confirmar   '))).toBeDefined()
  })

  it('looks at structure too', () => {
    expect(riskOfTarget(el('Go', { isSubmit: true }))).toBeDefined()
    expect(riskOfTarget(el('Go', { isSubmit: true, formSearch: true }))).toBeUndefined()
    expect(riskOfTarget(el('Auto-renew', { role: 'switch' }))).toBeDefined()
    expect(riskOfTarget(el('Yes', { inDialog: true }))).toBeDefined()
    expect(riskOfTarget(el('Yes'))).toBeUndefined()
    expect(riskOfTarget(el('Account', { role: 'link', hrefPath: '/account/delete' }))).toBeDefined()
    expect(riskOfTarget(el('Account', { role: 'link', hrefPath: '/account/profile' }))).toBeUndefined()
    expect(riskOfTarget(el('Cancel', { isSubmit: true }))).toBeDefined()
  })
})

describe('keys', () => {
  it('knows which keys exist and treats navigation as free', () => {
    expect(['F5', 'a', 'Control', 'Meta'].some(keyAllowed)).toBe(false)
    for (const k of ['Tab', 'Escape', 'ArrowDown', 'PageDown', 'Home', 'Backspace']) expect(riskOfKey(k, {}), k).toBeUndefined()
  })

  it('treats Enter as the click or the form submit it is', () => {
    expect(riskOfKey('Enter', { role: 'textbox', editable: true })).toBeUndefined()
    expect(riskOfKey('Enter', { role: 'textbox', editable: true, inForm: true })).toBeDefined()
    expect(riskOfKey('Enter', { role: 'textbox', editable: true, inForm: true, formSearch: true })).toBeUndefined()
    expect(riskOfKey('Enter', { role: 'button', name: 'Send' })).toBeDefined()
    expect(riskOfKey('Enter', { role: 'link', name: 'Distribution' })).toBeUndefined()
    expect(riskOfKey(' ', { role: 'switch', name: 'Notifications' })).toBeDefined()
  })
})

describe('refuseTyping', () => {
  it('refuses password, code and card fields and anything that is not a text field', () => {
    expect(refuseTyping({ editable: true, type: 'password' })).toBeDefined()
    expect(refuseTyping({ editable: true, autocomplete: 'one-time-code' })).toBeDefined()
    expect(refuseTyping({ editable: true, name: 'cardnumber', autocomplete: 'cc-number' })).toBeDefined()
    expect(refuseTyping({ editable: false })).toBeDefined()
    expect(refuseTyping({ editable: true, type: 'text', name: 'message' })).toBeUndefined()
  })
})
