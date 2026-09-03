// Confirmed against real aqw-idle traffic — see the escape table and known-command list in
// docs/design-handoff.md#screen-4--service-panel-packet-console-kind--packet-ie-aqw-idle.
// Whisper/private chat is intentionally not modelled yet: it has no confirmed real packet shape
// (only `zone` and `guild` chat channels are confirmed), so there is nothing to render here until
// that's captured.
export const escapeTable: Record<string, string> = {
  '%20': '␣',
  '%7C': '|',
  '%2C': ',',
  '%3A': ':',
  '%5B': '[',
  '%5D': ']',
  '%22': '"',
  '%2F': '/',
  '%25': '%',
  '%7B': '{',
  '%7D': '}',
  '%3D': '=',
  '%26': '&',
  '%23': '#',
}

export const knownCommands = ['addGoldExp', 'getDrop', 'aggroMon', 'questRewards', 'cmd', 'moderator', 'mtls', 'gar', 'stu', 'tfer', 'uotls', 'respawnMon']
