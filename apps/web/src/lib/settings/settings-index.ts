export type SettingsRow = { key: string; keywords: string }
export type SettingsSection = { id: string; label: string; rows: SettingsRow[] }

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    rows: [
      { key: 'mode', keywords: 'mode theme dark light auto daylight night' },
      { key: 'palette', keywords: 'palette color colour accent theme' },
    ],
  },
  { id: 'dock', label: 'Dock', rows: [{ key: 'dock', keywords: 'dock items order hide show modules number keys shortcuts' }] },
  {
    id: 'core',
    label: 'Core',
    rows: [
      { key: 'strands', keywords: 'strands density neural core' },
      { key: 'grid', keywords: 'grid background measurement' },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    rows: [
      { key: 'name', keywords: 'name rename workspace switcher title' },
      { key: 'actions', keywords: 'duplicate reset delete remove copy workspace' },
    ],
  },
  { id: 'services', label: 'Services', rows: [{ key: 'services', keywords: 'services registered retire hide status' }] },
  {
    id: 'layout',
    label: 'Layout',
    rows: [
      { key: 'rails', keywords: 'rails layout portrait stacked side' },
      { key: 'scale', keywords: 'interface scale zoom size enlarge' },
      { key: 'carplay', keywords: 'carplay car layout touch driving' },
    ],
  },
  {
    id: 'voice',
    label: 'Voice',
    rows: [
      { key: 'wake', keywords: 'wake word hey nox listen microphone' },
      { key: 'wake-sensitivity', keywords: 'wake sensitivity threshold' },
      { key: 'noise', keywords: 'noise filter microphone speech' },
      { key: 'warmup', keywords: 'bluetooth warm-up warmup link' },
      { key: 'tail', keywords: 'tail silence microphone reopen' },
      { key: 'audio-session', keywords: 'audio session safari playback call routing' },
    ],
  },
  {
    id: 'device',
    label: 'Device',
    rows: [
      { key: 'orb-quality', keywords: 'orb quality performance low high glow' },
      { key: 'sound', keywords: 'sound effects sfx audio interface' },
      { key: 'display', keywords: 'display screen resolution size pixels dpr' },
    ],
  },
]

export const searchTerms = (query: string): string[] => query.trim().toLowerCase().split(/\s+/).filter(Boolean)

// The section label is searched too, so a section's name brings in all of its rows.
export const rowMatches = (terms: string[], sectionLabel: string, keywords: string): boolean => {
  const haystack = `${sectionLabel} ${keywords}`.toLowerCase()
  return terms.every((t) => haystack.includes(t))
}

export type SectionView = { id: string; label: string; code: string; count: number; active: boolean }

export type SettingsView = {
  sections: SectionView[]
  shown: ReadonlySet<string>
  hits: number
  searching: boolean
}

// `sections` is what exists right now (no Services without services, no sensitivity while the wake word is off).
export function viewSettings(sections: SettingsSection[], query: string, selected: string): SettingsView {
  const terms = searchTerms(query)
  const searching = terms.length > 0
  const shown = new Set<string>()
  let hits = 0
  const views = sections.map((s, i) => {
    let count = 0
    for (const r of s.rows) {
      if (!searching || rowMatches(terms, s.label, r.keywords)) {
        shown.add(r.key)
        count++
      }
    }
    hits += searching ? count : 0
    return { id: s.id, label: s.label, code: String(i + 1).padStart(2, '0'), count, active: searching ? count > 0 : s.id === selected }
  })
  return { sections: views, shown, hits, searching }
}
