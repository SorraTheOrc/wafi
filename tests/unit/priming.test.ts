import { countTokens, summarize } from '../../src/lib/priming/summarize'

// Simple smoke tests; adjust to your test runner (vitest/jest) configuration
import { describe, it, expect } from 'vitest'

describe('priming utilities', () => {
  it('countTokens handles empty', () => {
    expect(countTokens('')).toBe(0)
  })

  it('summarize truncates', () => {
    const text = 'one two three four five six'
    const s = summarize(text, 3)
    expect(s.split(/\s+/).length).toBeGreaterThanOrEqual(3)
  })
})
