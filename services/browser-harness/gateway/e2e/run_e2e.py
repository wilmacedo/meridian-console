"""End-to-end check of the gateway against a local Chrome and site.py. Run by hand:
    services/browser-harness/gateway/e2e/run_e2e.sh
It talks to gateway.py the way the server does (JSON on stdin, the seal made with policy.seal)."""
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import policy  # noqa: E402

GATEWAY = HERE.parent / "gateway.py"
KEY = "e2e-test-key"
FAILS = []


def call(op, args=None, seal_for=None, key=KEY):
    """One gateway call. With seal_for (an earlier answer's fingerprint) it carries the matching seal."""
    body = {"op": op, "args": args or {}, "confirmKey": key}
    if seal_for:
        body["confirmation"] = policy.seal(KEY, seal_for)
    out = subprocess.run([sys.executable, str(GATEWAY)], input=json.dumps(body), capture_output=True, text=True, env=os.environ, timeout=120).stdout
    return json.loads(out)


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"))
    if not cond:
        FAILS.append(name)


def text_of(r):
    return r.get("text") or r.get("error") or ""


def counts():
    t = text_of(call("read", {"maxChars": 7000}))
    line = [l for l in t.splitlines() if l.startswith("counts:")]
    return line[0] if line else ""


def ref_of(snapshot, label):
    for line in snapshot.splitlines():
        if f'"{label}"' in line and line.startswith("["):
            return line[1 : line.index("]")]
    return None


port = os.environ["E2E_PORT"]
r = call("open", {"url": f"https://localhost:{port}/"})
check("open", r["ok"] and r["state"] == "ready", r)

snap = text_of(call("snapshot"))
check("snapshot lists controls with refs", ref_of(snap, "Delete Draft") and ref_of(snap, "Show details") and "# Test Console" in snap, snap[:400])
check("snapshot masks nothing it should show but flags the password field", "(secret field)" in snap, snap)

r = call("click", {"text": "Show details"})
check("free click by text", r["ok"] and "Clicked" in r["text"], r)
check("hidden section now visible", "Details revealed" in text_of(call("read")))

r = call("click", {"text": "Open"})
check("ambiguous text lists the candidates", r["ok"] and "controls match" in r["text"] and "Open popup" in r["text"], r)

for label, op_args in [("Delete Draft", {"text": "Delete Draft"}), ("Submit for Review", {"text": "Submit for Review"})]:
    r = call("click", op_args)
    check(f"risky click '{label}' asks first", r.get("needs_confirmation") is True and r.get("fingerprint"), r)
    check(f"'{label}' did nothing yet", "deleted" not in counts() and "submitted" not in counts(), counts())
    bad = call("click", op_args, seal_for=r["fingerprint"] + "x")
    check(f"'{label}' with a forged seal still asks", bad.get("needs_confirmation") is True, bad)
    wrongkey = subprocess.run([sys.executable, str(GATEWAY)], input=json.dumps({"op": "click", "args": op_args, "confirmKey": "other", "confirmation": policy.seal(KEY, r["fingerprint"])}), capture_output=True, text=True).stdout
    check(f"'{label}' with a seal from another key still asks", json.loads(wrongkey).get("needs_confirmation") is True, wrongkey)

r = call("click", {"text": "Delete Draft"})
ok = call("click", {"text": "Delete Draft"}, seal_for=r["fingerprint"])
check("risky click with the owner's seal goes through", ok["ok"] and "deleted=1" in counts(), (ok, counts()))

snap = text_of(call("snapshot"))
ref = ref_of(snap, "Submit for Review")
r = call("click", {"ref": ref})
check("risky click by ref asks too", r.get("needs_confirmation") is True, r)
x = call("scroll", {"ref": ref})
box = call("click", {"selector": "button:nth-of-type(3)", "nth": 1})
check("selector path also classified", box.get("needs_confirmation") is True or "Clicked" in text_of(box), box)

r = call("click", {"text": "External"})
check("link outside the allowlist is refused before clicking", not r["ok"] and "outside the allowlist" in r["error"], r)

r = call("click", {"text": "Account"})
check("link whose address looks destructive asks", r.get("needs_confirmation") is True, r)

r = call("tabs")
before_tabs = text_of(r)
r = call("click", {"text": "Open popup"})
check("popup to a foreign host is closed", r["ok"] and "outside the allowlist was closed" in r["text"], r)
check("no foreign tab left", "127.0.0.1" not in text_of(call("tabs")), text_of(call("tabs")))

r = call("click", {"text": "Open dialog"})
check("dialog opens freely", r["ok"], r)
snap = text_of(call("snapshot"))
check("snapshot shows the dialog", 'Open dialog: "Confirm"' in snap and "-- dialog 1 --" in snap, snap)
r = call("click", {"text": "OK"})
check("OK in a dialog asks", r.get("needs_confirmation") is True, r)
r = call("click", {"text": "Cancel"})
check("Cancel in a dialog is free", r["ok"] and "dialog-ok" not in counts(), r)

r = call("click", {"text": "Auto-renew"})
check("a switch asks", r.get("needs_confirmation") is True, r)

r = call("type", {"field": "Message", "text": "hello there"})
check("typing into a field", r["ok"] and "Nothing was submitted" in r["text"], r)
check("typed text is in the page", "hello there" in text_of(call("snapshot")), "")
r = call("type", {"field": "Password", "text": "hunter2"})
check("password field refused", not r["ok"] and "password" in r["error"], r)
r = call("press", {"key": "Enter"})
check("Enter in a POST form asks", r.get("needs_confirmation") is True and "posted" not in counts(), r)
r = call("press", {"key": "Escape"})
check("Escape is free", r["ok"], r)
r = call("press", {"key": "F5"})
check("shortcuts refused", not r["ok"] and "not allowed" in r["error"], r)
r = call("type", {"field": "Search box", "text": "anything", "clear": True})
check("type into the search field", r["ok"], r)
r = call("press", {"key": "Enter"})
check("Enter in a search form is free", r["ok"] and "Now:" in r["text"], r)

r = call("scroll", {"direction": "bottom"})
check("scroll to bottom", r["ok"], r)
r = call("wait", {"text": "Bottom button", "seconds": 3})
check("wait for text", r["ok"] and "appeared" in r["text"], r)
r = call("wait", {"text": "this will never show", "seconds": 1})
check("wait times out politely", r["ok"] and "not there" in r["text"], r)

call("open", {"url": f"https://localhost:{port}/"})
snap = text_of(call("snapshot"))
stale = ref_of(snap, "Show details")
call("open", {"url": f"https://localhost:{port}/?again"})
r = call("click", {"ref": stale})
check("stale ref after a reload is an error, not a wrong click", not r["ok"] and "stale" in r["error"], r)

r = call("read", {"includeHidden": True, "maxChars": 7000})
check("includeHidden reads a collapsed thread", "Guideline 2.1" in text_of(r), text_of(r)[:200])
full = text_of(call("read", {"maxChars": 7000}))
tail = text_of(call("read", {"offset": len(full) - 120, "maxChars": 7000}))
check("read takes an offset", "Bottom button" in tail and "Test Console\nApps" not in tail, tail[:120])
r = call("read", {"maxChars": 200, "includeHidden": True})
check("long text says where to continue", r["ok"] and r["truncated"] and "offset" in r["text"], r["text"][-120:])
check("read without includeHidden has no collapsed text", "Guideline 2.1" not in text_of(call("read")))

r = call("back")
check("back", r["ok"], r)
r = call("tabs", {"action": "list"})
check("tabs list", r["ok"] and "1." in r["text"], r)
r = call("screenshot")
check("screenshot", r["ok"] and Path(r["file"]).exists(), r)

os.environ["MERIDIAN_BROWSER_ALLOWED_DOMAINS"] = "elsewhere.test"
r = call("snapshot")
check("page off the allowlist is not touched", not r["ok"] and "outside the allowlist" in r["error"], r)
r = call("click", {"text": "Apps"})
check("nor clicked", not r["ok"], r)

log = (Path(os.environ["MERIDIAN_BROWSER_STATE_DIR"]) / "audit.log").read_text()
check("audit log never holds typed text, queries or the password", "hello there" not in log and "hunter2" not in log and "anything" not in log and "?again" not in log, "")
check("audit log recorded confirmations", '"state": "confirmed"' in log and '"state": "needs_confirmation"' in log, "")
check("audit log is private", oct(os.stat(Path(os.environ["MERIDIAN_BROWSER_STATE_DIR"]) / "audit.log").st_mode)[-3:] == "600", "")

print(f"\n{len(FAILS)} failed" if FAILS else "\nall passed")
sys.exit(1 if FAILS else 0)
