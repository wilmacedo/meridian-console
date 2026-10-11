// The desktop apps NOX can reach through a WebView debug port. Each is one entry here, not a case in the code:
// `MERIDIAN_DEVICES_APPS=anywh=9223,other=9224` (id=port the app's WebView listens on, on the PC).
export interface AppTarget {
  id: string
  remotePort: number
  // The local end of the ssh tunnel; offset so it never meets a port the app or the server already uses.
  localPort: number
}

const LOCAL_OFFSET = 10_000

export function parseTargets(raw: string | undefined): AppTarget[] {
  const out: AppTarget[] = []
  for (const part of (raw ?? '').split(',')) {
    const [id, port] = part.split('=').map((s) => s.trim())
    const remotePort = Number(port)
    if (!/^[a-z][a-z0-9-]*$/.test(id ?? '') || !Number.isInteger(remotePort) || remotePort < 1024 || remotePort + LOCAL_OFFSET > 65535) continue
    out.push({ id, remotePort, localPort: remotePort + LOCAL_OFFSET })
  }
  return out
}

// What the owner has to do when the port is closed: start the app with the WebView2 debug option.
export const closedHint = (t: AppTarget): string =>
  `Ask the owner to start ${t.id} with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=${t.remotePort} set in its environment.`
