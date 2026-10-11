import { DESCRIBE } from '../browser/page-scripts.js'

// Scripts run inside an app's page. The elements an outline lists are kept on `window.__nox`, so a ref (`@a3`)
// names the element itself and survives until the next outline; nothing is written into the app's DOM.

export const MAX_LINES = 60

// Visible headings and controls, one short line each, with a ref on everything that can be acted on.
export const outline = (): string => `(() => {
  const els = []
  const out = []
  const role = (e) => {
    const tag = e.tagName.toLowerCase()
    const type = (e.getAttribute('type') || '').toLowerCase()
    return e.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'button' ? 'button' : tag === 'select' ? 'combobox' : tag === 'textarea' ? 'textbox' : tag === 'input' ? (type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio' : type === 'submit' || type === 'button' ? 'button' : type === 'search' ? 'searchbox' : 'textbox') : tag)
  }
  const label = (e) => (e.getAttribute('aria-label') || (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' ? '' : e.innerText) || e.getAttribute('placeholder') || e.title || '').trim().replace(/\\s+/g, ' ').slice(0, 80)
  for (const e of document.querySelectorAll('h1, h2, h3, button, a[href], input, textarea, select, [role=button], [role=tab], [role=menuitem], [role=checkbox], [role=switch], [role=link]')) {
    const r = e.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0 || getComputedStyle(e).visibility === 'hidden') continue
    if (/^H[1-3]$/.test(e.tagName)) { out.push(e.tagName.toLowerCase() + ' "' + label(e) + '"'); continue }
    const kind = role(e)
    const typed = e.value !== undefined && (kind === 'textbox' || kind === 'searchbox') ? ' [' + (e.value ? e.value.length + ' chars' : 'empty') + ']' : ''
    out.push('@a' + els.length + ' ' + kind + (label(e) ? ' "' + label(e) + '"' : '') + typed + (e.disabled ? ' [disabled]' : ''))
    els.push(e)
  }
  window.__nox = els
  return JSON.stringify({ title: document.title, lines: out.slice(0, ${MAX_LINES}), total: out.length })
})()`

// The element behind a ref: what it is, and where to click it after bringing it into view.
export const locate = (index: number): string => `(() => {
  const e = window.__nox && window.__nox[${index}]
  if (!e || !e.isConnected) return JSON.stringify(null)
  e.scrollIntoView({ block: 'center', inline: 'center' })
  const r = e.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return JSON.stringify(null)
  return JSON.stringify({ facts: (${DESCRIBE})(e), x: r.x + r.width / 2, y: r.y + r.height / 2 })
})()`

// Select what is in a field so the next text replaces it.
export const selectAll = (index: number): string => `(() => { const e = window.__nox[${index}]; e.focus(); if (e.select) e.select(); return true })()`

export const waitProbe = (what: { text?: string; selector?: string }): string =>
  what.selector ? `!!document.querySelector(${JSON.stringify(what.selector)})` : `document.body.innerText.toLowerCase().includes(${JSON.stringify((what.text ?? '').toLowerCase())})`
