import { describe, expect, it } from 'vitest'
import { closedHint, parseTargets } from './targets.js'

describe('parseTargets', () => {
  it('reads id=port pairs and offsets the local end of the tunnel', () => {
    expect(parseTargets('anywh=9223, other=9300')).toEqual([
      { id: 'anywh', remotePort: 9223, localPort: 19223 },
      { id: 'other', remotePort: 9300, localPort: 19300 },
    ])
  })

  it('ignores anything malformed or out of range', () => {
    expect(parseTargets(undefined)).toEqual([])
    expect(parseTargets('Bad=9223,x=80,y=abc,z=60000,=9223,noport')).toEqual([])
  })

  it('tells the owner how to open the port', () => {
    expect(closedHint({ id: 'anywh', remotePort: 9223, localPort: 19223 })).toBe('Ask the owner to start anywh with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223 set in its environment.')
  })
})
