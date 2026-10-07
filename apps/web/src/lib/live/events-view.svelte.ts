import type { MeridianEvent } from '@meridian/service-sdk'
import { live } from './stream.svelte'

// 'all', or the source (a service id, "nox") whose events the Events window shows.
export const eventsView = $state({ filter: 'all' })

export const eventsFor = (source: string): MeridianEvent[] => (source === 'all' ? live.events : live.events.filter((e) => e.source === source))
