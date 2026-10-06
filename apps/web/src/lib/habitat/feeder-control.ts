interface Reading<T> {
  value: T
  at: string
}

export interface FeederStatus {
  lastFeed: { portions: number; source: 'manual' | 'auto'; at: string } | null
  battery: Reading<string> | null
  foodStorage: Reading<string> | null
  blocked: boolean
}

export async function fetchFeederStatus(): Promise<FeederStatus> {
  const res = await fetch('/api/feeder/status')
  if (!res.ok) throw new Error(`status responded ${res.status}`)
  return (await res.json()) as FeederStatus
}

export async function feed(portions: number): Promise<void> {
  const res = await fetch('/api/feeder/feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ portions }),
  })
  if (!res.ok) throw new Error(`feed responded ${res.status}`)
}
