import { describe, expect, it } from 'vitest'
import { carriageFromText, carriageLabel, seatColorFromText, seatColorLabel } from '.'

describe('HÉV labels', () => {
  it('maps preset seat colours to keys in either language and keeps custom text', () => {
    expect(seatColorFromText('vörös')).toBe('red')
    expect(seatColorFromText(' Red ')).toBe('red')
    expect(seatColorFromText('MÁV')).toBe('mav')
    expect(seatColorFromText('zöld  csíkos')).toBe('zöld csíkos')
    expect(seatColorLabel('zöld csíkos')).toBe('zöld csíkos')
  })
  it('labels numeric carriages and keeps custom ones', () => {
    expect(carriageLabel('2')).not.toBe('2')
    expect(carriageLabel('vezérlő')).toBe('vezérlő')
    expect(carriageFromText('Carriage 2')).toBe('2')
    expect(carriageFromText('2. kocsi')).toBe('2')
    expect(carriageFromText(' 02 ')).toBe('2')
    expect(carriageFromText('vezérlő')).toBe('vezérlő')
  })
})
