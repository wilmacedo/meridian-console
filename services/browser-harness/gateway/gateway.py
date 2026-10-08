#!/usr/bin/env python3
"""Gateway between Meridian and the owner's real Chrome, built on browser-harness.

browser-harness hands its caller arbitrary JavaScript and raw CDP, which can read cookies and click anything.
This script is the only thing Meridian runs. It offers a small set of generic primitives (see OPS) and puts the
policy around every one of them:

  - the page it is about to touch must be on the allowlist, checked before and again after each step;
  - a click, key press or form entry that could send, publish, delete, buy, accept or change something is
    refused unless the call carries the seal of the owner's confirmation (policy.py decides, the server seals);
  - nothing it returns or logs contains cookies, headers, storage, passwords or typed text.

Protocol: `gateway.py` reads one JSON object from stdin, {"op", "args", "confirmKey", "confirmation"}, and prints
one JSON object, {"ok", "text", ...} or {"ok": false, "error"}; a risky call answers {"needs_confirmation": true,
"fingerprint", "what"} and is sent again with the seal. For hand testing: `gateway.py <op> '<json args>'`.
"""
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pagejs  # noqa: E402
import policy  # noqa: E402

STATE = Path(os.environ.get("MERIDIAN_BROWSER_STATE_DIR") or Path.home() / ".meridian" / "browser-harness").expanduser()
CDP_URL = (os.environ.get("MERIDIAN_BROWSER_CDP_URL") or "http://127.0.0.1:9222").rstrip("/")
ALLOWED = [d.strip().lower().lstrip(".") for d in (os.environ.get("MERIDIAN_BROWSER_ALLOWED_DOMAINS") or "*").split(",") if d.strip()]
DEFAULT_READ_CHARS = 6_000
MAX_READ_CHARS = 7_000
MAX_TYPE_CHARS = 2_000
MAX_WAIT_S = 15
KEEP_SHOTS = 20
MAX_LINKS = 80

STATE.mkdir(parents=True, exist_ok=True, mode=0o700)

# Settle the harness's own configuration before importing it: no telemetry, no update check, no recordings, never
# the cloud, and only the one endpoint we were given.
for key in ("BROWSER_USE_API_KEY", "BU_CDP_WS", "BU_AUTOSPAWN", "BU_BROWSER_ID"):
    os.environ.pop(key, None)
os.environ.update({
    "BH_HOME": str(STATE / "harness"),
    "BH_TELEMETRY": "0",
    "ANONYMIZED_TELEMETRY": "false",
    "BH_UPDATE_CHECK": "0",
    "BH_RECORD": "0",
    "BH_DOMAIN_SKILLS": "0",
    "BU_NAME": "meridian",
    "BU_CDP_URL": CDP_URL,
})


class Refused(Exception):
    pass


class Request:
    def __init__(self, op, args, confirm_key="", confirmation=""):
        self.op, self.args, self.confirm_key, self.confirmation = op, args, confirm_key, confirmation


def audit(op, url, state, **extra):
    """One JSON line per call. Host and path only: query strings can carry tokens. Never page text, never typed text."""
    u = urlparse(url or "")
    entry = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "op": op, "host": u.hostname, "path": u.path, "state": state, **extra}
    log = STATE / "audit.log"
    with open(log, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    os.chmod(log, 0o600)


def reachable():
    try:
        urllib.request.urlopen(f"{CDP_URL}/json/version", timeout=2).read()
        return True
    except Exception:
        return False


def harness():
    """Imported late, and only once the debug port answers: browser-harness would otherwise try to start a Chrome."""
    if not reachable():
        raise Refused(f"the browser's debug port is not reachable at {CDP_URL} (is the tunnel up and Chrome running?)")
    from browser_harness import helpers
    from browser_harness.admin import ensure_daemon

    ensure_daemon()
    return helpers


def page_info(h, tries=4):
    """page_info() right after a navigation can run before the document exists; give it a moment."""
    for i in range(tries):
        try:
            return h.page_info()
        except RuntimeError:
            if i == tries - 1:
                raise
            time.sleep(1)


def attached(h):
    if h.ensure_real_tab() is None:
        h.new_tab("about:blank")
    return page_info(h)


def pjs(h, name, args=None):
    raw = h.js(pagejs.call(name, args))
    return json.loads(raw) if raw else {}


def where(info):
    u = urlparse(info.get("url") or "")
    path = u.path if len(u.path) <= 70 else u.path[:67] + "…"
    title = (info.get("title") or "").replace("\U0001F434 ", "")
    return f'{u.hostname or ""}{path}' + (f' — "{title}"' if title else "")


def guard(h, op):
    """The page about to be touched must be readable: on the allowlist. A sign-in page is reported, not touched."""
    info = attached(h)
    state = policy.classify_url(info.get("url") or "", ALLOWED)
    if state == "blocked":
        audit(op, info.get("url"), "blocked")
        raise Refused("the browser is on a page outside the allowlist, so nothing is done there; use open to go to an allowed page")
    if state == "needs_login":
        audit(op, info.get("url"), "needs_login")
        raise Refused("the browser is on a sign-in page: the owner has to sign in; nothing else is done until then")
    return info


def target_ids(h):
    return {t["targetId"] for t in h.list_tabs(include_chrome=False)}


def settle(h):
    time.sleep(0.4)
    try:
        h.wait_for_network_idle(timeout=4, idle_ms=500)
    except Exception:
        pass


def enforce(h, op, before):
    """After a step: new tabs outside the allowlist are closed (allowed ones are followed), and a page that has
    wandered off the allowlist is sent back. Returns notes for the caller."""
    notes = []
    for t in h.list_tabs(include_chrome=False):
        if t["targetId"] in before:
            continue
        if policy.classify_url(t["url"], ALLOWED) == "blocked":
            h.cdp("Target.closeTarget", targetId=t["targetId"])
            audit(op, t["url"], "closed_new_tab")
            notes.append("a new tab outside the allowlist was closed")
        else:
            h.switch_tab(t["targetId"])
            notes.append("it opened a new tab, now the active one")
    info = page_info(h)
    state = policy.classify_url(info.get("url") or "", ALLOWED)
    if state == "blocked":
        h.js("history.back()")
        time.sleep(1.0)
        info = page_info(h)
        if policy.classify_url(info.get("url") or "", ALLOWED) == "blocked":
            h.cdp("Page.navigate", url="about:blank")
        audit(op, info.get("url"), "left_allowlist")
        raise Refused("that led outside the allowlist, so the browser was sent back")
    if state == "needs_login":
        notes.append("the session asked to sign in: the owner has to sign in")
    return info, notes


def after(h, op, before, did):
    settle(h)
    info, notes = enforce(h, op, before)
    return {"ok": True, "text": " ".join([did, f"Now: {where(info)}."] + [n[0].upper() + n[1:] + "." for n in notes])}


def need_confirmation(req, op, info, facts, reason):
    """None when the call may go ahead, else the answer asking the server to get the owner's confirmation."""
    if not reason:
        return None
    fp = policy.fingerprint(op, info.get("url"), facts)
    if policy.seal_valid(req.confirm_key, fp, req.confirmation):
        audit(op, info.get("url"), "confirmed", role=facts.get("role"), name=facts.get("name", "")[:60], reason=reason)
        return None
    audit(op, info.get("url"), "needs_confirmation", role=facts.get("role"), name=facts.get("name", "")[:60], reason=reason)
    label = f'{facts.get("role")} "{facts.get("name", "")[:80]}"' if facts.get("name") else str(facts.get("role") or "element")
    u = urlparse(info.get("url") or "")
    return {"ok": False, "needs_confirmation": True, "fingerprint": fp, "reason": reason,
            "what": f"{op} {label} on {u.hostname}{u.path[:60]} ({reason})"}


TARGET_KEYS = ("ref", "text", "label", "selector", "role", "nth", "x", "y")


def resolve(h, args, scroll):
    """The element an action names, with its facts, or an answer to hand back (ambiguous, not found)."""
    t = pjs(h, "target" if scroll else "resolve_noscroll", {k: args.get(k) for k in TARGET_KEYS})
    if "error" in t:
        raise Refused(t["error"])
    if "ambiguous" in t:
        lines = [f'  [{c["ref"]}] {c["role"]} "{c["name"]}"' for c in t["ambiguous"]]
        return None, {"ok": True, "text": f'{t["count"]} controls match. Say which with ref (or nth):\n' + "\n".join(lines)}
    return t, None


# --- operations ------------------------------------------------------------------------------------------

def op_open(req):
    url = (req.args.get("url") or "")
    u = urlparse(url)
    if u.scheme != "https":
        raise Refused("only https URLs are opened")
    if not policy.host_allowed(u.hostname, ALLOWED):
        raise Refused(f"{u.hostname or url!r} is not on the allowlist ({', '.join(ALLOWED)})")
    h = harness()
    attached(h)
    h.cdp("Page.navigate", _response_timeout=30, url=url)
    h.wait_for_load(timeout=20)
    settle(h)
    info = page_info(h)
    state = policy.classify_url(info.get("url") or "", ALLOWED)
    if state == "blocked":
        h.cdp("Page.navigate", url="about:blank")
    audit("open", info.get("url"), state)
    if state == "blocked":
        raise Refused("the page ended up on a host outside the allowlist; it was closed")
    note = " The session is signed out: the owner has to sign in." if state == "needs_login" else ""
    return {"ok": True, "state": state, "text": f"Opened {where(info)}.{note}"}


def op_snapshot(req):
    h = harness()
    info = guard(h, "snapshot")
    snap = pjs(h, "snapshot", {"max": req.args.get("max"), "viewportOnly": bool(req.args.get("viewportOnly"))})
    lines = [f"Page: {where(info)}"]
    if snap["dialogs"]:
        lines.append("Open dialog: " + ", ".join(f'"{d}"' for d in snap["dialogs"]))
    current = 0
    for it in snap["items"]:
        if it["dialog"] != current:
            current = it["dialog"]
            lines.append(f"-- dialog {current} --" if current else "-- page --")
        name = it["name"].replace('"', "'")
        if it["role"] == "heading":
            lines.append("#" * min(max(it["level"], 1), 4) + " " + name)
            continue
        flags = "".join(f" {k}" for k in ("disabled",) if it.get(k))
        if "checked" in it:
            flags += " checked" if it["checked"] else " unchecked"
        if "expanded" in it:
            flags += " expanded" if it["expanded"] else " collapsed"
        if it.get("selected"):
            flags += " selected"
        if it.get("secret"):
            flags += " (secret field)"
        value = f' value="{it["value"]}"' if it.get("value") else ""
        away = f" ({it['where']})" if it.get("where") else ""
        lines.append(f'[{it["ref"]}] {it["role"]} "{name}"{flags}{value}{away}')
    hidden = snap["total"] - len(snap["items"])
    if hidden > 0:
        lines.append(f"… {hidden} more elements not listed; scroll, or ask for viewportOnly.")
    lines.append(f'Scroll {snap["scrollY"]} of {snap["maxY"]} px.')
    audit("snapshot", info.get("url"), "ready", count=len(snap["items"]))
    return {"ok": True, "text": "\n".join(lines)}


def op_read(req):
    limit = max(1, min(int(req.args.get("maxChars") or DEFAULT_READ_CHARS), MAX_READ_CHARS))
    offset = max(0, int(req.args.get("offset") or 0))
    h = harness()
    info = guard(h, "read")
    # Collapsed sections (a message thread, an accordion) are not in innerText; the clone's textContent has them.
    text = h.js(HIDDEN_TEXT_JS if req.args.get("includeHidden") else VISIBLE_TEXT_JS) or ""
    text = SECRETS.sub("[redacted]", text)
    chunk = text[offset:offset + limit]
    more = len(text) - (offset + len(chunk))
    audit("read", info.get("url"), "ready", chars=len(chunk))
    out = f"Page: {where(info)}\n{chunk}"
    if more > 0:
        out += f"\n… {more} more characters; call read again with offset {offset + len(chunk)}."
    return {"ok": True, "text": out, "truncated": more > 0}


VISIBLE_TEXT_JS = "document.body ? document.body.innerText : ''"
HIDDEN_TEXT_JS = """(() => { if (!document.body) return ''; const c = document.body.cloneNode(true); c.querySelectorAll('script,style,noscript,template,svg').forEach(e => e.remove()); c.querySelectorAll('*').forEach(e => e.append(/^(DIV|P|LI|TR|H[1-6]|SECTION|ARTICLE|UL|OL|BR|TABLE|HEADER|FOOTER|NAV)$/.test(e.tagName) ? '\\n' : ' ')); return c.textContent.replace(/[ \\t]+/g, ' ').replace(/\\n\\s*\\n+/g, '\\n'); })()"""
SECRETS = re.compile(r"(?i)(bearer\s+[a-z0-9._~+/=-]{16,})|\b[A-Za-z0-9_\-]{40,}\b")

LINKS_JS = """JSON.stringify(Array.from(document.querySelectorAll('a[href]')).slice(0, 2000).map(a => ({text: (a.innerText || a.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 100), href: a.href})))"""


def op_links(req):
    h = harness()
    info = guard(h, "links")
    found, seen = [], set()
    for link in json.loads(h.js(LINKS_JS) or "[]"):
        u = urlparse(link.get("href") or "")
        # Path only, like everywhere else: a query string can carry tokens. `open` takes it back as a URL.
        if u.scheme != "https" or not policy.host_allowed(u.hostname, ALLOWED) or not u.path or (u.hostname, u.path) in seen:
            continue
        seen.add((u.hostname, u.path))
        found.append(f'- {link.get("text") or "(no text)"} → https://{u.hostname}{u.path}')
    audit("links", info.get("url"), "ready", count=min(len(found), MAX_LINKS))
    shown = found[:MAX_LINKS]
    more = f"\n… {len(found) - MAX_LINKS} more." if len(found) > MAX_LINKS else ""
    return {"ok": True, "text": f"Links on {where(info)}:\n" + "\n".join(shown) + more}


def op_click(req):
    h = harness()
    info = guard(h, "click")
    t, answer = resolve(h, req.args, scroll=True)
    if answer:
        return answer
    facts = t["facts"]
    if facts["disabled"]:
        raise Refused(f'{facts["role"]} "{facts["name"]}" is disabled')
    if t["covered"]:
        raise Refused(f'"{facts["name"] or facts["tag"]}" is covered by "{t["coveredBy"]}"; close that or scroll first')
    if facts.get("href_host") and not policy.host_allowed(facts["href_host"], ALLOWED):
        audit("click", info.get("url"), "blocked_link", role=facts["role"], name=facts["name"][:60])
        raise Refused(f'this link leads outside the allowlist ({facts["href_host"]}); it was not clicked')
    asked = need_confirmation(req, "click", info, facts, policy.risk_of_target(facts))
    if asked:
        return asked
    before = target_ids(h)
    audit("click", info.get("url"), "ready", role=facts["role"], name=facts["name"][:60])
    h.click_at_xy(t["cx"], t["cy"])
    return after(h, "click", before, f'Clicked {facts["role"]} "{facts["name"][:60]}".')


def op_type(req):
    text = req.args.get("text")
    if not isinstance(text, str) or not text:
        raise Refused("give the text to type")
    if len(text) > MAX_TYPE_CHARS:
        raise Refused(f"at most {MAX_TYPE_CHARS} characters at a time")
    h = harness()
    info = guard(h, "type")
    # Here `text` is what to type; the field is named by ref, label (the gateway's name for `field`), selector or x and y.
    target = {k: v for k, v in req.args.items() if k in TARGET_KEYS and k != "text"}
    if req.args.get("field"):
        target["label"] = req.args["field"]
    t, answer = resolve(h, target, scroll=False)
    if answer:
        return answer
    facts = t["facts"]
    problem = policy.refuse_typing(facts)
    if problem:
        audit("type", info.get("url"), "refused", role=facts["role"], name=facts["name"][:60])
        raise Refused(f'will not type into "{facts["name"][:60]}": {problem}')
    pjs(h, "prepare_type", {**target, "clear": bool(req.args.get("clear"))})
    h.type_text(text)
    audit("type", info.get("url"), "ready", role=facts["role"], name=facts["name"][:60], chars=len(text))
    return {"ok": True, "text": f'Typed {len(text)} characters into {facts["role"]} "{facts["name"][:60]}". Nothing was submitted.'}


def op_press(req):
    key = req.args.get("key")
    if not isinstance(key, str):
        raise Refused("give the key")
    h = harness()
    info = guard(h, "press")
    active = pjs(h, "active")
    try:
        reason = policy.risk_of_key(key, active)
    except ValueError as e:
        raise Refused(str(e))
    asked = need_confirmation(req, f"press {key}", info, active, reason)
    if asked:
        return asked
    before = target_ids(h)
    audit("press", info.get("url"), "ready", key=key)
    h.press_key(" " if key == "Space" else key)
    return after(h, "press", before, f"Pressed {key}.")


def op_scroll(req):
    h = harness()
    info = guard(h, "scroll")
    if any(req.args.get(k) for k in ("ref", "text", "selector")):
        t, answer = resolve(h, req.args, scroll=True)
        if answer:
            return answer
        did = f'Scrolled to {t["facts"]["role"]} "{t["facts"]["name"][:60]}".'
    else:
        c = pjs(h, "centre")
        direction = req.args.get("direction") or "down"
        amount = max(50, min(int(req.args.get("amount") or 600), 3000))
        if direction in ("top", "bottom"):
            h.js("window.scrollTo(0, %s)" % ("0" if direction == "top" else "document.documentElement.scrollHeight"))
        elif direction in ("up", "down"):
            h.scroll(c["x"], c["y"], dy=amount if direction == "down" else -amount)
        else:
            raise Refused("direction is up, down, top or bottom")
        did = f"Scrolled {direction}."
    time.sleep(0.4)
    now = page_info(h)
    audit("scroll", info.get("url"), "ready")
    return {"ok": True, "text": f'{did} Position {now.get("sy", 0)} of {max(0, now.get("ph", 0) - now.get("h", 0))} px.'}


def op_wait(req):
    if not (req.args.get("text") or req.args.get("selector")):
        raise Refused("say what to wait for: text or selector")
    gone = bool(req.args.get("gone"))
    seconds = max(1, min(float(req.args.get("seconds") or 8), MAX_WAIT_S))
    h = harness()
    info = guard(h, "wait")
    started = time.time()
    while time.time() - started < seconds:
        try:
            present = pjs(h, "wait_check", {"text": req.args.get("text"), "selector": req.args.get("selector")})["present"]
        except RuntimeError as e:
            raise Refused("invalid selector" if "selector" in str(e).lower() else str(e)[:100])
        if present != gone:
            audit("wait", info.get("url"), "ready")
            return {"ok": True, "text": ("It is gone" if gone else "It appeared") + f" after {time.time() - started:.1f}s."}
        time.sleep(0.3)
    audit("wait", info.get("url"), "timeout")
    return {"ok": True, "text": f"Still {'there' if gone else 'not there'} after {seconds:g}s."}


def op_history(req):
    step = -1 if req.op == "back" else 1
    h = harness()
    guard(h, req.op)
    before = target_ids(h)
    h.js(f"history.go({step})")
    return after(h, req.op, before, "Went back." if step < 0 else "Went forward.")


def op_tabs(req):
    h = harness()
    action = req.args.get("action") or "list"
    tabs = h.list_tabs(include_chrome=False)
    ours = [t for t in tabs if policy.tab_is_ours(t["url"], ALLOWED)]
    if action == "list":
        cur = h.current_tab().get("targetId")
        lines = [f'{i}. {where({"url": t["url"], "title": t["title"]}) or "blank"}' + (" (active)" if t["targetId"] == cur else "") for i, t in enumerate(ours, 1)]
        other = len(tabs) - len(ours)
        audit("tabs", "", "list", count=len(ours))
        return {"ok": True, "text": "Tabs:\n" + "\n".join(lines) + (f"\n({other} tab(s) outside the allowlist are not shown)" if other else "")}
    index = int(req.args.get("id") or 0)
    if not 1 <= index <= len(ours):
        raise Refused(f"id is the tab's number from the list, 1 to {len(ours)}")
    tab = ours[index - 1]
    if action == "switch":
        h.switch_tab(tab["targetId"])
        audit("tabs", tab["url"], "switch")
        return {"ok": True, "text": f"Switched to tab {index}: {where(tab)}."}
    if action == "close":
        h.cdp("Target.closeTarget", targetId=tab["targetId"])
        audit("tabs", tab["url"], "close")
        return {"ok": True, "text": f"Closed tab {index}."}
    raise Refused("action is list, switch or close")


def op_quit(req):
    """Closes Chrome itself (the server asks the owner first). Internal: it is for `stop`, not a browsing primitive."""
    h = harness()
    audit("quit", "", "closing")
    try:
        h.cdp("Browser.close")
    except Exception:
        pass  # Chrome drops the connection as it exits
    return {"ok": True, "text": "Chrome was asked to close."}


def op_screenshot(req):
    h = harness()
    info = guard(h, "screenshot")
    shots = STATE / "shots"
    shots.mkdir(exist_ok=True, mode=0o700)
    path = shots / f"{int(time.time())}.png"
    h.capture_screenshot(str(path), max_dim=1600)
    os.chmod(path, 0o600)
    for old in sorted(shots.glob("*.png"))[:-KEEP_SHOTS]:
        old.unlink()
    audit("screenshot", info.get("url"), "ready")
    return {"ok": True, "file": str(path), "text": f"Saved a screenshot of {where(info)} at {path}."}


OPS = {
    "open": op_open, "snapshot": op_snapshot, "read": op_read, "links": op_links, "click": op_click, "type": op_type,
    "press": op_press, "scroll": op_scroll, "wait": op_wait, "back": op_history, "forward": op_history, "tabs": op_tabs, "screenshot": op_screenshot, "quit": op_quit,
}


def read_request():
    if len(sys.argv) > 1:
        return Request(sys.argv[1], json.loads(sys.argv[2]) if len(sys.argv) > 2 else {})
    body = json.loads(sys.stdin.read() or "{}")
    return Request(body.get("op", ""), body.get("args") or {}, body.get("confirmKey") or "", body.get("confirmation") or "")


def main():
    try:
        req = read_request()
        if req.op not in OPS:
            raise Refused(f"unknown operation {req.op!r}; allowed: {', '.join(OPS)}")
        print(json.dumps(OPS[req.op](req)))
    except Refused as e:
        print(json.dumps({"ok": False, "error": str(e)}))
    except Exception as e:  # a harness or CDP failure: say what failed, never dump page or browser data
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {str(e)[:300]}"}))


if __name__ == "__main__":
    main()
