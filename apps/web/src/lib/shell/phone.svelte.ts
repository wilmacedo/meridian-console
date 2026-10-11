import { layout } from '../workspace/layout.svelte'
import { prefs } from '../workspace/prefs.svelte'
import { phoneFor } from './phone'

export const isPhone = (): boolean => phoneFor(layout.w, prefs.carplay)
