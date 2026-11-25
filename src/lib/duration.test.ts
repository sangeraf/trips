import { describe, expect, it } from 'vitest'
import { calcDuration, formatDuration, parseDuration } from './duration'

describe('duration', () => {
  it('calculates across midnight', () => {
    expect(calcDuration('08:10', '08:55')).toBe(45)
    expect(calcDuration('23:30', '00:15')).toBe(45)
    expect(calcDuration('08:10', '')).toBeNull()
  })
  it('parses manual input', () => {
    expect(parseDuration('85')).toBe(85)
    expect(parseDuration('1:25')).toBe(85)
    expect(parseDuration('1h 25m')).toBe(85)
    expect(parseDuration('2ó')).toBe(120)
    expect(parseDuration('abc')).toBeNull()
  })
  it('formats', () => {
    expect(formatDuration(85)).toBe('1:25')
    expect(formatDuration(null)).toBe('')
  })
})
