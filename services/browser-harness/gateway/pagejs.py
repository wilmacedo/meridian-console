"""The JavaScript the gateway runs inside the page. It only reads the DOM and resolves a target to an element;
the clicking and typing are done by the harness with real input events, after the policy has looked at the facts
this returns. Every function here is a template: `call(name, args)` builds one self-contained expression."""
import json

PRELUDE = r"""
const INTERACTIVE = 'a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=checkbox],[role=radio],[role=switch],[role=combobox],[role=option],[role=textbox],[role=searchbox],[contenteditable=""],[contenteditable="true"]';
const HEADINGS = 'h1,h2,h3,h4,[role=heading]';
const DIALOGS = 'dialog[open],[role=dialog],[role=alertdialog],[aria-modal="true"]';
const S = (window.__mx = window.__mx || { n: 0, p: Math.random().toString(36).slice(2, 4), refs: new Map(), byEl: new WeakMap() });
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function deepAll(sel, root) {
  root = root || document;
  const out = Array.from(root.querySelectorAll(sel));
  for (const el of root.querySelectorAll('*')) if (el.shadowRoot) out.push(...deepAll(sel, el.shadowRoot));
  return out;
}
function visible(el) {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const s = getComputedStyle(el);
  return !(s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) === 0);
}
function labelledBy(el) {
  const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
  return norm(ids.map((i) => { const n = document.getElementById(i); return n ? n.textContent : ''; }).join(' '));
}
function nameOf(el) {
  let n = norm(el.getAttribute('aria-label')) || labelledBy(el);
  if (!n && el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes((el.type || '').toLowerCase())) n = norm(el.value);
  if (!n && el.labels && el.labels.length) n = norm(Array.from(el.labels).map((l) => l.textContent).join(' '));
  if (!n) n = norm(el.innerText || el.textContent);
  if (!n) n = norm(el.getAttribute('title')) || norm(el.getAttribute('placeholder')) || norm(el.getAttribute('alt')) || norm(el.getAttribute('name'));
  if (!n) { const i = el.querySelector('img[alt]'); if (i) n = norm(i.getAttribute('alt')); }
  return n.slice(0, 120);
}
function editable(el) {
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return !el.readOnly && !el.disabled;
  if (el.tagName !== 'INPUT') return false;
  const t = (el.type || 'text').toLowerCase();
  return !el.readOnly && !el.disabled && !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color', 'hidden'].includes(t);
}
function roleOf(el) {
  const r = el.getAttribute('role');
  if (r) return r.split(' ')[0];
  const t = el.tagName;
  if (t === 'A') return 'link';
  if (t === 'BUTTON' || t === 'SUMMARY') return 'button';
  if (t === 'SELECT') return 'combobox';
  if (t === 'TEXTAREA') return 'textbox';
  if (t === 'INPUT') {
    const ty = (el.type || 'text').toLowerCase();
    if (['button', 'submit', 'reset', 'image'].includes(ty)) return 'button';
    if (ty === 'checkbox' || ty === 'radio') return ty;
    if (ty === 'search') return 'searchbox';
    return 'textbox';
  }
  if (el.isContentEditable) return 'textbox';
  return /^H[1-6]$/.test(t) ? 'heading' : 'generic';
}
function factsOf(el) {
  const form = el.closest('form');
  const method = form ? (form.getAttribute('method') || 'get').toLowerCase() : '';
  const type = (el.type || '').toLowerCase();
  const formSearch = !!form && (form.getAttribute('role') === 'search' || !!form.querySelector('input[type=search],[role=searchbox]'));
  const dlg = el.closest(DIALOGS);
  let href = '', hrefHost = '';
  if (el.tagName === 'A' && el.href) { try { const u = new URL(el.href); href = u.pathname; hrefHost = u.protocol === 'https:' ? u.hostname : u.protocol; } catch (e) {} }
  // A <button>'s `type` property says "submit" even with no attribute, so ask the attribute.
  const attrType = (el.getAttribute('type') || '').toLowerCase();
  const isSubmit = (el.tagName === 'BUTTON' && (attrType === 'submit' || (!attrType && !!form))) || (el.tagName === 'INPUT' && ['submit', 'image'].includes(type));
  return {
    role: roleOf(el), name: nameOf(el), tag: el.tagName.toLowerCase(), type, autocomplete: el.getAttribute('autocomplete') || '',
    id: el.id || '', field_name: el.getAttribute('name') || '', disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
    editable: editable(el), in_form: !!form, form_method: method, form_search: formSearch, in_dialog: !!dlg,
    dialog: dlg ? norm(dlg.getAttribute('aria-label') || (dlg.querySelector(HEADINGS) || {}).textContent) : '', href_path: href, href_host: hrefHost, is_submit: isSubmit,
  };
}
function refFor(el) {
  let k = S.byEl.get(el);
  if (!k) { k = S.p + '-' + (++S.n); S.byEl.set(el, k); S.refs.set(k, new WeakRef(el)); }
  return k;
}
function byRef(ref) {
  const w = S.refs.get(ref);
  const el = w && w.deref();
  return el && el.isConnected ? el : null;
}
function brief(el) { return { ref: refFor(el), role: roleOf(el), name: nameOf(el) }; }

function pick(list, args, what) {
  if (!list.length) return { error: 'no visible ' + what + ' matches' };
  if (args.nth) return list[args.nth - 1] ? { el: list[args.nth - 1] } : { error: 'only ' + list.length + ' match, nth ' + args.nth + ' does not exist' };
  if (list.length > 1) return { ambiguous: list.slice(0, 8).map(brief), count: list.length };
  return { el: list[0] };
}
function find(args) {
  if (args.ref) {
    const el = byRef(args.ref);
    return el ? { el } : { error: 'that ref is stale (the page changed or it is from an older snapshot); take a new snapshot' };
  }
  if (args.selector) {
    let list;
    try { list = deepAll(args.selector).filter(visible); } catch (e) { return { error: 'invalid selector' }; }
    return pick(list, args, 'element for the selector');
  }
  if (args.text || args.label) {
    const want = norm(args.text || args.label).toLowerCase();
    const all = deepAll(INTERACTIVE).filter(visible).filter((el) => !args.role || roleOf(el) === args.role);
    const named = all.map((el) => [el, nameOf(el).toLowerCase()]);
    for (const test of [(n) => n === want, (n) => n.startsWith(want), (n) => n.includes(want)]) {
      const hit = named.filter(([, n]) => n && test(n)).map(([el]) => el);
      if (hit.length) return pick(hit, args, 'control called "' + args.text + '"');
    }
    return { error: 'no visible control called "' + (args.text || args.label) + '"; take a snapshot to see what is on the page' };
  }
  if (typeof args.x === 'number' && typeof args.y === 'number') {
    const hit = document.elementFromPoint(args.x, args.y);
    return hit ? { el: hit.closest(INTERACTIVE) || hit } : { error: 'nothing at that point' };
  }
  return { error: 'say what to act on: ref, text, selector, or x and y' };
}
function target(args, scroll) {
  const r = find(args);
  if (!r.el) return r;
  const el = r.el;
  if (scroll) el.scrollIntoView({ block: 'center', inline: 'center' });
  const b = el.getBoundingClientRect();
  const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  // The point must land on the element that was classified, not on whatever lies over it.
  const covered = !hit || !(hit === el || el.contains(hit) || (el.shadowRoot && el.shadowRoot.contains(hit)) || (hit.getRootNode && hit.getRootNode().host && el.contains(hit.getRootNode().host)));
  return { facts: factsOf(el), ref: refFor(el), cx, cy, covered, coveredBy: covered && hit ? nameOf(hit) || hit.tagName.toLowerCase() : '', inView: cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight };
}

function snapshot(args) {
  const max = Math.min(args.max || 120, 300);
  const dialogs = deepAll(DIALOGS).filter(visible);
  const items = [];
  let total = 0;
  for (const el of deepAll(HEADINGS + ',' + INTERACTIVE)) {
    if (!visible(el)) continue;
    const isHeading = el.matches(HEADINGS) && !el.matches(INTERACTIVE);
    const b = el.getBoundingClientRect();
    const inView = b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth;
    if (args.viewportOnly && !inView) continue;
    const name = nameOf(el);
    if (!name && !isHeading && !el.matches('input,textarea,select')) continue;
    total++;
    if (items.length >= max) continue;
    const dlg = el.closest(DIALOGS);
    const item = { ref: isHeading ? '' : refFor(el), role: isHeading ? 'heading' : roleOf(el), name: name.slice(0, 80), level: isHeading ? (+el.tagName[1] || 2) : 0, dialog: dlg ? dialogs.indexOf(dlg) + 1 : 0, where: inView ? '' : (b.top < 0 ? 'above' : 'below') };
    if (!isHeading) {
      const t = (el.type || '').toLowerCase();
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') item.disabled = true;
      if (t === 'checkbox' || t === 'radio' || el.hasAttribute('aria-checked')) item.checked = el.checked === true || el.getAttribute('aria-checked') === 'true';
      if (el.hasAttribute('aria-expanded')) item.expanded = el.getAttribute('aria-expanded') === 'true';
      if (el.hasAttribute('aria-selected')) item.selected = el.getAttribute('aria-selected') === 'true';
      if (editable(el) && t !== 'password' && el.value) item.value = norm(el.value).slice(0, 40);
      if (t === 'password') item.secret = true;
    }
    items.push(item);
  }
  return { items, total, dialogs: dialogs.map((d) => norm(d.getAttribute('aria-label') || (d.querySelector(HEADINGS) || {}).textContent).slice(0, 60)), scrollY: Math.round(scrollY), maxY: Math.max(0, Math.round(document.documentElement.scrollHeight - innerHeight)) };
}
function active() {
  let el = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  return el && el !== document.body ? factsOf(el) : {};
}
function prepareType(args) {
  const r = target(args, true);
  if (!r.facts) return r;
  const el = find(args).el;
  el.focus();
  if (args.clear) { if (el.select) el.select(); else { const g = getSelection(); const rg = document.createRange(); rg.selectNodeContents(el); g.removeAllRanges(); g.addRange(rg); } }
  return r;
}
function waitCheck(args) {
  const text = args.text ? args.text.toLowerCase() : '';
  const present = text ? (document.body ? document.body.innerText : '').toLowerCase().includes(text) : deepAll(args.selector).some(visible);
  return { present };
}
function viewportCentre() { return { x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) }; }
"""

def call(name, args=None):
    """One self-contained expression: the prelude, then `name(args)`, JSON-encoded."""
    payload = json.dumps(args or {})
    if name in ("target", "resolve_noscroll"):
        fn = "target(" + payload + ", " + ("true" if name == "target" else "false") + ")"
    elif name == "active":
        fn = "active()"
    elif name == "centre":
        fn = "viewportCentre()"
    else:
        fn = {"snapshot": "snapshot", "prepare_type": "prepareType", "wait_check": "waitCheck"}[name] + "(" + payload + ")"
    return "(() => {" + PRELUDE + " return JSON.stringify(" + fn + "); })()"
