import { clock } from '../clock.svelte'
import { isDaytime, PALETTES, type PaletteId, type PaletteVariant, type ThemeMode } from './palettes'

export const theme = $state({
  mode: 'auto' as ThemeMode,
  palette: 'mono' as PaletteId,
})

// A palette without a light variant (blue) stays dark whatever the mode is.
export const hasLightVariant = (palette: PaletteId): boolean => PALETTES[palette].light !== undefined

export function isLight(): boolean {
  if (!hasLightVariant(theme.palette)) return false
  return theme.mode === 'light' || (theme.mode === 'auto' && isDaytime(clock.now))
}

export function activeVariant(): PaletteVariant {
  const p = PALETTES[theme.palette]
  return isLight() && p.light ? p.light : p.dark
}

const TOKENS = ['bg', 'pn', 'hi', 'fg', 'ac', 'mu', 'sh', 'vg', 'vga'] as const

export const darkVariant = (): PaletteVariant => PALETTES[theme.palette].dark

// The dark variant is also exposed as --nx-dark-*, which the .nx-dark class (app.css) swaps in, for
// surfaces that must stay dark in light mode (camera frames).
export function applyTheme(root: HTMLElement, v: PaletteVariant, dark: PaletteVariant): void {
  for (const k of TOKENS) {
    root.style.setProperty(`--nx-${k}`, v[k])
    root.style.setProperty(`--nx-dark-${k}`, dark[k])
  }
  root.style.setProperty('--nx-page', v.page)
}
