"""What the gateway allows. Pure functions, no browser: everything here is unit-tested.

Three decisions live here:
  - which pages may be touched at all (the allowlist, and where a signed-out session lands);
  - whether one particular action is risky enough that the owner must confirm it first;
  - the seal that proves the owner did, so the agent cannot confirm for itself.
"""
import hashlib
import hmac
import re
from urllib.parse import urlparse

# Where a signed-out session lands. Not readable, but not an error either: the owner has to sign in.
LOGIN_HOSTS = {"idmsa.apple.com", "appleid.apple.com"}


def host_allowed(host, allowed):
    host = (host or "").lower()
    return any(host == d or host.endswith("." + d) for d in allowed)


def classify_url(url, allowed):
    """'ready' (readable), 'needs_login' (the owner must sign in) or 'blocked' (outside the allowlist)."""
    u = urlparse(url or "")
    if u.hostname in LOGIN_HOSTS:
        return "needs_login"
    return "ready" if u.scheme == "https" and host_allowed(u.hostname, allowed) else "blocked"


def tab_is_ours(url, allowed):
    """A tab the gateway may list and switch to: blank, or an allowlisted https page (a sign-in page counts)."""
    return url in ("", "about:blank") or classify_url(url, allowed) != "blocked"


# ---------------------------------------------------------------------------------------------------------
# Risk. The agent decides where to act; this decides whether that needs the owner. When unsure, it asks.

# Words that send, publish, delete, buy, accept or change something. English and Portuguese.
RISKY_VERBS = re.compile(
    r"\b("
    r"delete|remove|discard|erase|destroy|revoke|terminate|unlink|disconnect|deactivate|disable|unsubscribe|unpublish|"
    r"submit|resubmit|send|publish|post|release|upload|import|"
    r"buy|purchase|pay|checkout|order|subscribe|upgrade|renew|donate|"
    r"accept|agree|approve|authorize|allow|grant|confirm|"
    r"save|apply|update|change|reset|rename|transfer|withdraw|invite|add|create|enable|request|report|block|"
    r"sign out|sign off|log out|logout|"
    r"excluir|apagar|remover|descartar|revogar|desativar|desconectar|cancelar assinatura|"
    r"enviar|publicar|postar|liberar|reenviar|"
    r"comprar|pagar|assinar|renovar|doar|"
    r"aceitar|concordo|concordar|aprovar|autorizar|permitir|confirmar|"
    r"salvar|aplicar|atualizar|alterar|redefinir|renomear|transferir|sacar|convidar|adicionar|criar|ativar|solicitar|bloquear|"
    r"sair"
    r")\b"
)
# "Cancel" or "Close" alone just leave a dialog; "Cancel Submission" does not.
CANCEL_SOMETHING = re.compile(r"^(cancel|cancelar)\s+\S")
HARMLESS_EXACT = {"cancel", "cancelar", "close", "fechar", "dismiss", "back", "voltar", "no", "nao", "not now", "agora nao", "later", "skip", "learn more", "show more", "show less", "expand", "collapse", "search", "buscar", "pesquisar"}
# In a dialog these mean "go ahead".
AFFIRMATIVE = {"yes", "ok", "okay", "continue", "done", "got it", "proceed", "sim", "continuar", "concluir", "entendi", "prosseguir"}
RISKY_PATH = re.compile(r"/(delete|remove|logout|signout|sign-out|cancel|revoke|unsubscribe|purchase|buy|checkout)(/|$|-|_)", re.I)
TOGGLE_ROLES = {"checkbox", "radio", "switch"}


def _norm(text):
    text = (text or "").lower()
    text = text.replace("\xa0", " ")
    text = re.sub(r"[áàâãä]", "a", text)
    text = re.sub(r"[éèêë]", "e", text)
    text = re.sub(r"[íìîï]", "i", text)
    text = re.sub(r"[óòôõö]", "o", text)
    text = re.sub(r"[úùûü]", "u", text)
    text = text.replace("ç", "c")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def risk_of_target(facts):
    """Why clicking this element needs the owner's confirmation, or None when it is safe to just do.

    `facts` describe the element the click will land on: role, name, tag, type, form (method, search),
    in_dialog, href_path, is_submit. Reading, navigating and opening things are free.
    """
    name = _norm(facts.get("name"))
    role = facts.get("role") or ""
    if name in HARMLESS_EXACT and not facts.get("is_submit"):
        return None
    if CANCEL_SOMETHING.match(name):
        return f'cancels something ("{facts.get("name")}")'
    verb = RISKY_VERBS.search(name)
    if verb:
        return f'its label says "{verb.group(1)}" ("{facts.get("name")}")'
    if facts.get("is_submit") and not facts.get("form_search"):
        return "it submits a form"
    if role in TOGGLE_ROLES:
        return "it flips a setting"
    if facts.get("in_dialog") and name in AFFIRMATIVE:
        return "it confirms a dialog"
    if role == "link" and RISKY_PATH.search(facts.get("href_path") or ""):
        return "its address looks like a destructive action"
    return None


ALLOWED_KEYS = {"Enter", "Tab", "Escape", " ", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", "Backspace", "Delete"}
ACTIVATES = {"button", "link", "menuitem", "tab", "checkbox", "radio", "switch", "option", "combobox"}


def risk_of_key(key, active):
    """Same question for a key press. `active` are the facts of the focused element (or {})."""
    if key not in ALLOWED_KEYS:
        raise ValueError(f"key {key!r} is not allowed; allowed: {', '.join(sorted(k for k in ALLOWED_KEYS if k != ' '))}")
    if key not in ("Enter", " ", "Space"):
        return None
    role = active.get("role") or ""
    if role in ACTIVATES and not active.get("editable"):
        # Enter or Space on a focused button is a click on it.
        return risk_of_target(active)
    if key == "Enter" and active.get("editable") and active.get("in_form") and not active.get("form_search") and active.get("type") != "search":
        return "Enter inside a form submits it"
    return None


SECRET_FIELD = re.compile(r"password|passwd|senha|one-time-code|cc-|credit|card number|cvv|cvc", re.I)


def refuse_typing(facts):
    """A reason the gateway will not type into this field at all (the owner signs in, not the agent), or None."""
    if (facts.get("type") or "").lower() == "password" or SECRET_FIELD.search(" ".join(str(facts.get(k) or "") for k in ("autocomplete", "name", "id"))):
        return "it is a password, code or card field; the owner enters those, never the agent"
    if not facts.get("editable"):
        return "it is not a text field"
    return None


# ---------------------------------------------------------------------------------------------------------
# The seal. The server keeps a key the agent never sees; a risky action only runs with the seal of the exact
# thing the owner confirmed.

def fingerprint(op, url, facts):
    u = urlparse(url or "")
    raw = "|".join([op, u.hostname or "", u.path or "", facts.get("role") or "", facts.get("tag") or "", _norm(facts.get("name")), facts.get("type") or ""])
    return hashlib.sha256(raw.encode()).hexdigest()[:20]


def seal(key, fp):
    return hmac.new(key.encode(), fp.encode(), hashlib.sha256).hexdigest()[:32]


def seal_valid(key, fp, given):
    return bool(key) and bool(given) and hmac.compare_digest(seal(key, fp), str(given))
