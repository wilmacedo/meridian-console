import { describe, expect, it } from 'vitest'
import { BASE_KEYTERMS, keytermsFor } from './transcribe.js'

describe('keytermsFor', () => {
  it('adds the service names to the fixed vocabulary, without duplicates', () => {
    const terms = keytermsFor(['aqw-idle', 'pet-feeder', 'Docker'])
    expect(terms).toEqual(expect.arrayContaining([...BASE_KEYTERMS, 'aqw-idle', 'pet-feeder']))
    expect(terms.filter((t) => t === 'Docker')).toHaveLength(1)
  })
})
