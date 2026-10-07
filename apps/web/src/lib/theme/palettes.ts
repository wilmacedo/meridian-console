import type { PaletteId, ThemeMode } from '@meridian/service-sdk'

export type { PaletteId, ThemeMode }

// Colours are "r,g,b" triples so CSS can compose them with any alpha: rgb(var(--nx-ac)) / rgba(var(--nx-ac), .5).
export interface PaletteVariant {
  bg: string
  pn: string
  hi: string
  fg: string
  ac: string
  mu: string
  sh: string
  vg: string
  vga: string
  // Multiplies every shadow's opacity: a shadow that reads on a dark field is far too heavy on a light one.
  so: string
  // Warning amber: NOX is busy and can be stopped.
  wn: string
  page: string
  // Orb strand colours and spark colour, as rgb triples.
  orbA: string
  orbB: string
  orbW: string
}

export interface Palette {
  dark: PaletteVariant
  light?: PaletteVariant
}

const darkVignette = { vg: '0,0,0', vga: '.75', so: '1', wn: '255,205,80' }
const lightWarn = '168,112,0'

export const PALETTES: Record<PaletteId, Palette> = {
  mono: {
    dark: {
      bg: '3,3,3', pn: '7,7,7', hi: '255,255,255', fg: '255,255,255', ac: '206,206,206', mu: '140,140,140', sh: '0,0,0',
      ...darkVignette, page: '#030303', orbA: '140,140,140', orbB: '220,220,220', orbW: '235,248,255',
    },
    light: {
      bg: '245,245,243', pn: '252,252,250', hi: '0,0,0', fg: '14,14,16', ac: '52,52,58', mu: '112,112,118', sh: '20,20,30',
      vg: '225,225,222', vga: '.6', so: '.32', wn: lightWarn, page: '#f3f3f1', orbA: '140,140,140', orbB: '220,220,220', orbW: '235,248,255',
    },
  },
  blue: {
    dark: {
      bg: '2,7,26', pn: '6,18,60', hi: '150,205,255', fg: '255,255,255', ac: '127,214,255', mu: '150,190,240', sh: '0,4,20',
      ...darkVignette, page: '#02071a', orbA: '90,170,255', orbB: '150,230,255', orbW: '225,245,255',
    },
  },
  meridian: {
    dark: {
      bg: '9,15,14', pn: '12,21,19', hi: '120,220,195', fg: '226,236,232', ac: '70,190,165', mu: '112,140,132', sh: '0,0,0',
      ...darkVignette, page: '#090f0e', orbA: '60,170,145', orbB: '240,130,50', orbW: '215,250,240',
    },
    light: {
      bg: '236,240,236', pn: '250,252,249', hi: '10,60,50', fg: '14,30,27', ac: '20,125,105', mu: '98,120,114', sh: '20,40,35',
      vg: '215,224,218', vga: '.6', so: '.32', wn: lightWarn, page: '#e9eee9', orbA: '60,170,145', orbB: '240,130,50', orbW: '215,250,240',
    },
  },
}

export const PALETTE_LABELS: Record<PaletteId, string> = { mono: 'Mono', blue: 'Blue', meridian: 'Meridian' }
export const MODE_LABELS: Record<ThemeMode, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' }

// Light from 07:00 to 18:00 local time. The OS colour-scheme preference is deliberately never read.
export const isDaytime = (date: Date): boolean => date.getHours() >= 7 && date.getHours() < 18
