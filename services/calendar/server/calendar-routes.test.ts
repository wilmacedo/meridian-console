import { afterEach, describe, expect, it } from 'vitest'
import { redirectUriFor } from './calendar-routes.js'

afterEach(() => {
  delete process.env.CALENDAR_REDIRECT_URI
})

describe('redirectUriFor', () => {
  it('follows the address the page was opened from, as the proxy forwards it', () => {
    expect(redirectUriFor({ 'x-forwarded-host': 'meridian.wilmacedo.com', host: '127.0.0.1:5173' })).toBe('https://meridian.wilmacedo.com/api/services/calendar/oauth/callback')
    expect(redirectUriFor({ 'x-forwarded-host': 'debian-desktop.tailbf060.ts.net, other', 'x-forwarded-proto': 'https' })).toBe('https://debian-desktop.tailbf060.ts.net/api/services/calendar/oauth/callback')
  })

  it('uses the Host header when nothing is forwarded, and lets the environment pin it', () => {
    expect(redirectUriFor({ host: 'localhost:5173', 'x-forwarded-proto': 'http' })).toBe('http://localhost:5173/api/services/calendar/oauth/callback')
    process.env.CALENDAR_REDIRECT_URI = 'https://fixed.example/cb'
    expect(redirectUriFor({ host: 'anything' })).toBe('https://fixed.example/cb')
  })
})
