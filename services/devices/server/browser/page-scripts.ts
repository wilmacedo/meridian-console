// Small scripts run inside the page through tool.evaluate. They return a few lines, which is where the token saving
// over reading the whole outline comes from. Each is an expression that evaluates to a JSON string.

export const DESCRIBE = `(e) => {
  if (!e) return null
  const tag = e.tagName.toLowerCase()
  const type = (e.getAttribute('type') || '').toLowerCase()
  const role = e.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'button' ? 'button' : tag === 'select' ? 'combobox' : tag === 'textarea' ? 'textbox' : tag === 'input' ? (type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio' : type === 'submit' || type === 'button' ? 'button' : type === 'search' ? 'searchbox' : 'textbox') : tag)
  const form = e.closest('form')
  const name = (e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('placeholder') || e.getAttribute('title') || '').trim().replace(/\\s+/g, ' ').slice(0, 100)
  let hrefPath = ''
  try { hrefPath = e.href ? new URL(e.href).pathname : '' } catch {}
  return {
    name, role, type, id: e.id || '', autocomplete: e.getAttribute('autocomplete') || '',
    editable: e.isContentEditable || role === 'textbox' || role === 'searchbox' || role === 'combobox' && tag !== 'select',
    inForm: !!form,
    formSearch: type === 'search' || !!e.closest('[role=search], search, form[role=search]'),
    isSubmit: (tag === 'button' && (type === '' || type === 'submit') && !!form) || (tag === 'input' && type === 'submit'),
    inDialog: !!e.closest('dialog, [role=dialog], [role=alertdialog], [aria-modal=true]'),
    hrefPath,
  }
}`

export const where = (): string => 'JSON.stringify([location.href, document.title])'

export const describeSelector = (selector: string): string => `JSON.stringify((${DESCRIBE})(document.querySelector(${JSON.stringify(selector)})))`

export const describeActive = (): string => `JSON.stringify((${DESCRIBE})(document.activeElement === document.body ? null : document.activeElement))`

// Up to 8 controls or headings whose visible text, label or placeholder holds the text, each with a selector that
// click and type accept; failing that, how often the text appears in the page and the first line around it.
export const find = (text: string): string => `(() => {
  const needle = ${JSON.stringify(text.toLowerCase())}
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const selectorOf = (e) => {
    if (e.id && document.querySelectorAll('#' + CSS.escape(e.id)).length === 1) return '#' + CSS.escape(e.id)
    const parts = []
    for (let n = e; n && n.nodeType === 1 && parts.length < 6; n = n.parentElement) {
      let part = n.tagName.toLowerCase()
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : []
      if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')'
      parts.unshift(part)
      if (n.id) break
    }
    return parts.join(' > ')
  }
  const hits = []
  for (const e of document.querySelectorAll('a, button, input, textarea, select, summary, label, h1, h2, h3, [role=button], [role=link], [role=tab], [role=menuitem]')) {
    const label = (e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('placeholder') || '').trim().replace(/\\s+/g, ' ')
    if (label.toLowerCase().includes(needle) && visible(e)) hits.push(e.tagName.toLowerCase() + ' "' + label.slice(0, 80) + '" ' + selectorOf(e))
    if (hits.length === 8) break
  }
  if (hits.length) return JSON.stringify(hits)
  const body = document.body.innerText
  const at = body.toLowerCase().indexOf(needle)
  if (at < 0) return JSON.stringify([])
  const count = body.toLowerCase().split(needle).length - 1
  return JSON.stringify(['text appears ' + count + 'x, first: ' + body.slice(Math.max(0, at - 40), at + needle.length + 60).replace(/\\s+/g, ' ')])
})()`

// Up to 20 distinct links with their text, for `open`. Anything that is not http(s) is left out.
export const links = (contains: string | undefined): string => `(() => {
  const needle = ${JSON.stringify((contains ?? '').toLowerCase())}
  const seen = new Set()
  const out = []
  for (const a of document.querySelectorAll('a[href]')) {
    let href
    try { href = new URL(a.href) } catch { continue }
    if (!/^https?:$/.test(href.protocol) || seen.has(href.href)) continue
    const text = (a.getAttribute('aria-label') || a.innerText || a.title || '').trim().replace(/\\s+/g, ' ').slice(0, 70)
    if (!text || (needle && !(text + ' ' + href.href).toLowerCase().includes(needle))) continue
    seen.add(href.href)
    out.push([text, href.href.slice(0, 200)])
    if (out.length === 20) break
  }
  return JSON.stringify(out)
})()`
