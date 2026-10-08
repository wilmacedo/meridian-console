import unittest

import policy as p

ALLOWED = ["appstoreconnect.apple.com"]


def el(name, role="button", **kw):
    return {"name": name, "role": role, "tag": "button", **kw}


class Urls(unittest.TestCase):
    def test_states(self):
        self.assertEqual(p.classify_url("https://appstoreconnect.apple.com/apps", ALLOWED), "ready")
        self.assertEqual(p.classify_url("https://x.appstoreconnect.apple.com/", ALLOWED), "ready")
        self.assertEqual(p.classify_url("https://evilappstoreconnect.apple.com/", ALLOWED), "blocked")
        self.assertEqual(p.classify_url("http://appstoreconnect.apple.com/", ALLOWED), "blocked")
        self.assertEqual(p.classify_url("https://idmsa.apple.com/appleauth", ALLOWED), "needs_login")
        self.assertEqual(p.classify_url("javascript:alert(1)", ALLOWED), "blocked")

    def test_a_login_page_on_an_allowed_host(self):
        self.assertEqual(p.classify_url("https://appstoreconnect.apple.com/login", ALLOWED), "needs_login")
        self.assertEqual(p.classify_url("https://appstoreconnect.apple.com/login?returnUrl=%2Fapps", ALLOWED), "needs_login")
        self.assertEqual(p.classify_url("https://appstoreconnect.apple.com/signin/x", ALLOWED), "needs_login")
        self.assertEqual(p.classify_url("https://appstoreconnect.apple.com/apps/1/distribution", ALLOWED), "ready")
        self.assertEqual(p.classify_url("https://appstoreconnect.apple.com/loginhelp", ALLOWED), "ready")
        self.assertEqual(p.classify_url("https://evil.test/login", ALLOWED), "blocked")

    def test_tabs(self):
        self.assertTrue(p.tab_is_ours("about:blank", ALLOWED))
        self.assertTrue(p.tab_is_ours("https://idmsa.apple.com/x", ALLOWED))
        self.assertFalse(p.tab_is_ours("https://mail.example.com/", ALLOWED))

    def test_wildcard_allows_any_https_host(self):
        anywhere = ["*"]
        self.assertTrue(p.host_allowed("www.ingresso.com", anywhere))
        self.assertFalse(p.host_allowed("", anywhere))
        self.assertFalse(p.host_allowed(None, anywhere))
        self.assertEqual(p.classify_url("https://www.ingresso.com/filmes", anywhere), "ready")
        self.assertEqual(p.classify_url("https://www.ingresso.com/login", anywhere), "needs_login")
        self.assertEqual(p.classify_url("https://idmsa.apple.com/appleauth", anywhere), "needs_login")
        self.assertEqual(p.classify_url("http://www.ingresso.com/", anywhere), "blocked")
        self.assertEqual(p.classify_url("javascript:alert(1)", anywhere), "blocked")
        self.assertTrue(p.tab_is_ours("https://mail.example.com/", anywhere))


class Risk(unittest.TestCase):
    def test_free(self):
        for name in ["Distribution", "App Review", "View App Review Issues & Messages", "Edit", "Cancel", "Close", "Search", "Show more", "Reply", "Messages"]:
            self.assertIsNone(p.risk_of_target(el(name)), name)

    def test_risky_labels(self):
        for name in ["Resubmit to App Review", "Submit for Review", "Delete Draft", "Send", "Publish", "Buy now", "Accept", "I Agree", "Save", "Remove App", "Sign Out", "Cancel Submission", "Enviar", "Excluir", "Cancelar assinatura", "Confirmar", "Salvar", "Apagar rascunho"]:
            self.assertIsNotNone(p.risk_of_target(el(name)), name)

    def test_accents_and_case(self):
        self.assertIsNotNone(p.risk_of_target(el("EXCLUÍR")))
        self.assertIsNotNone(p.risk_of_target(el("  Confirmar  \xa0")))

    def test_structure(self):
        self.assertIsNotNone(p.risk_of_target(el("Go", is_submit=True)))
        self.assertIsNone(p.risk_of_target(el("Go", is_submit=True, form_search=True)))
        self.assertIsNotNone(p.risk_of_target(el("Auto-renew", role="switch")))
        self.assertIsNotNone(p.risk_of_target(el("Yes", in_dialog=True)))
        self.assertIsNone(p.risk_of_target(el("Yes")))
        self.assertIsNotNone(p.risk_of_target(el("Account", role="link", href_path="/account/delete")))
        self.assertIsNone(p.risk_of_target(el("Account", role="link", href_path="/account/profile")))

    def test_cancel_alone_in_a_submit_button_is_still_a_submit(self):
        self.assertIsNotNone(p.risk_of_target(el("Cancel", is_submit=True)))


class Keys(unittest.TestCase):
    def test_not_allowed(self):
        for k in ["F5", "a", "Control", "Meta"]:
            with self.assertRaises(ValueError):
                p.risk_of_key(k, {})

    def test_navigation_is_free(self):
        for k in ["Tab", "Escape", "ArrowDown", "PageDown", "Home", "Backspace"]:
            self.assertIsNone(p.risk_of_key(k, {}), k)

    def test_enter(self):
        self.assertIsNone(p.risk_of_key("Enter", {"role": "textbox", "editable": True}))
        self.assertIsNotNone(p.risk_of_key("Enter", {"role": "textbox", "editable": True, "in_form": True}))
        self.assertIsNone(p.risk_of_key("Enter", {"role": "textbox", "editable": True, "in_form": True, "form_search": True}))
        self.assertIsNone(p.risk_of_key("Enter", {"role": "searchbox", "editable": True, "in_form": True, "type": "search"}))
        self.assertIsNotNone(p.risk_of_key("Enter", {"role": "button", "name": "Send"}))
        self.assertIsNone(p.risk_of_key("Enter", {"role": "link", "name": "Distribution"}))
        self.assertIsNotNone(p.risk_of_key(" ", {"role": "switch", "name": "Notifications"}))


class Typing(unittest.TestCase):
    def test_refuse(self):
        self.assertIsNotNone(p.refuse_typing({"editable": True, "type": "password"}))
        self.assertIsNotNone(p.refuse_typing({"editable": True, "autocomplete": "one-time-code"}))
        self.assertIsNotNone(p.refuse_typing({"editable": True, "name": "cardnumber", "autocomplete": "cc-number"}))
        self.assertIsNotNone(p.refuse_typing({"editable": False}))
        self.assertIsNone(p.refuse_typing({"editable": True, "type": "text", "name": "message"}))


class Seal(unittest.TestCase):
    def test_roundtrip(self):
        fp = p.fingerprint("click", "https://appstoreconnect.apple.com/apps/1?token=x", el("Submit"))
        self.assertEqual(fp, p.fingerprint("click", "https://appstoreconnect.apple.com/apps/1?token=y", el("  submit ")))
        self.assertNotEqual(fp, p.fingerprint("click", "https://appstoreconnect.apple.com/apps/2", el("Submit")))
        s = p.seal("k", fp)
        self.assertTrue(p.seal_valid("k", fp, s))
        self.assertFalse(p.seal_valid("other", fp, s))
        self.assertFalse(p.seal_valid("k", fp + "x", s))
        self.assertFalse(p.seal_valid("", fp, s))
        self.assertFalse(p.seal_valid("k", fp, None))


if __name__ == "__main__":
    unittest.main()
