"""A tiny HTTPS site with every trap the gateway has to handle, for run_e2e.py. Usage: site.py <port> <cert> <key>"""
import http.server
import ssl
import sys

PORT, CERT, KEY = int(sys.argv[1]), sys.argv[2], sys.argv[3]
PAGE = """<!doctype html><title>Test Console</title><body style="font:14px sans-serif">
<h1>Test Console</h1>
<nav><a href="/apps">Apps</a> <a href="/account/delete">Account</a> <a href="https://127.0.0.1:%(port)d/out">External</a></nav>
<h2>Actions</h2>
<button onclick="show()">Show details</button>
<div id="d" hidden>Details revealed: rejection reason 2.1</div>
<button onclick="count('deleted')">Delete Draft</button>
<button onclick="count('submitted')">Submit for Review</button>
<button onclick="window.open('https://127.0.0.1:%(port)d/popup')">Open popup</button>
<button onclick="document.getElementById('dlg').hidden=false">Open dialog</button>
<div role="dialog" id="dlg" hidden aria-label="Confirm"><h3>Are you sure?</h3>
  <button onclick="count('dialog-ok');document.getElementById('dlg').hidden=true">OK</button>
  <button onclick="document.getElementById('dlg').hidden=true">Cancel</button></div>
<form role="search" method="get"><input type="search" name="q" aria-label="Search box"><button type="submit">Go</button></form>
<form method="post" onsubmit="event.preventDefault();count('posted')"><label>Message <input name="msg" type="text"></label><button type="submit">Send</button></form>
<label>Password <input type="password" name="pw"></label>
<label><input type="checkbox" onchange="count('toggled')"> Auto-renew</label>
<section><button aria-expanded="false" onclick="document.getElementById('thread').hidden=false">Apple Today 12:43 AM</button>
<div id="thread" hidden>Apple says: Guideline 2.1 - Performance - App Completeness, please provide a demo account.</div></section>
<p id="log">counts:</p>
<div style="height:2200px">spacer</div><button id="bottom">Bottom button</button>
<script>
const c = (window.__c = {});
function render(){ document.getElementById('log').textContent = 'counts: ' + Object.entries(c).map(([k,v]) => k + '=' + v).join(' '); }
function count(k){ c[k] = (c[k]||0) + 1; render(); }
function show(){ document.getElementById('d').hidden = false; }
</script>"""


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = (PAGE % {"port": PORT} if not self.path.startswith("/popup") and not self.path.startswith("/out") else "<h1>Elsewhere</h1>").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CERT, KEY)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
srv.serve_forever()
