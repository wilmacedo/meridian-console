export const host = $state({ name: '' })

export async function loadHost(): Promise<void> {
  try {
    const res = await fetch('/api/host')
    if (res.ok) host.name = ((await res.json()) as { name: string }).name
  } catch {
    // The header simply omits the name until the server answers.
  }
}
