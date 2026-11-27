import { describe, expect, it } from 'vitest'
import { calcDelay, calcDuration, formatDuration, normalizeTime, parseDuration } from './duration'

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

  it('normalizes typed 24-hour times', () => {
    expect(normalizeTime('815')).toBe('08:15')
    expect(normalizeTime('8.15')).toBe('08:15')
    expect(normalizeTime('23:50')).toBe('23:50')
    expect(normalizeTime('2350')).toBe('23:50')
    expect(normalizeTime('7')).toBe('07:00')
    expect(normalizeTime('24:00')).toBeNull()
    expect(normalizeTime('8:7')).toBeNull()
  })
  it('calculates a signed delay on the nearer day', () => {
    expect(calcDelay('23:50', '00:10')).toBe(20)
    expect(calcDelay('00:05', '23:58')).toBe(-7)
    expect(calcDelay('10:00', '10:00')).toBe(0)
    expect(calcDelay('10:00', '')).toBeNull()
  })
})
