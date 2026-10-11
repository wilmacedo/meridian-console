// Which hosts each profile may reach. `MERIDIAN_DEVICES_BROWSER_ALLOWED_DOMAINS` reads
// `personal=youtube.com,example.com;work=*`; a profile with no entry falls back to `*=...`, and without that to
// every https host. A host matches itself and its subdomains.
export function parseAllowlist(raw: string | undefined): (profile: string) => string[] {
  const entries = new Map<string, string[]>()
  for (const part of (raw ?? '').split(';')) {
    const [profile, hosts] = part.split('=')
    if (!profile?.trim() || !hosts?.trim()) continue
    entries.set(profile.trim().toLowerCase(), hosts.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean))
  }
  return (profile) => entries.get(profile.toLowerCase()) ?? entries.get('*') ?? ['*']
}
