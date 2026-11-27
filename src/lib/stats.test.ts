import { describe, expect, it } from 'vitest'
import type { Trip } from '../db/types'
import { avgMin, byWeekday, delayStats, elapsedMin, lineKey, sortAgg, type Agg } from './stats'

const agg = (label: string, count: number, minutes: number, timed = count): Agg => ({ key: label, label, count, minutes, timed, km: 0, first: '', last: '' })

describe('sortAgg', () => {
  const list = [agg('b', 1, 90), agg('', 5, 10), agg('A10', 3, 30), agg('A9', 2, 60)]
  it('sorts A–Z with numbers in order and unnamed last', () => {
    expect(sortAgg(list, 'abc').map((a) => a.label)).toEqual(['A9', 'A10', 'b', ''])
  })
  it('sorts by count or time descending', () => {
    expect(sortAgg(list, 'count').map((a) => a.count)).toEqual([5, 3, 2, 1])
    expect(sortAgg(list, 'time').map((a) => a.minutes)).toEqual([90, 60, 30, 10])
  })
  it('sorts by average per timed trip, untimed last', () => {
    const l = [agg('a', 4, 40, 2), agg('b', 1, 30), agg('c', 3, 0, 0), agg('d', 2, 10)]
    expect(avgMin(l[0])).toBe(20)
    expect(avgMin(l[2])).toBeNull()
    expect(sortAgg(l, 'avgAsc').map((a) => a.label)).toEqual(['d', 'a', 'b', 'c'])
    expect(sortAgg(l, 'avgDesc').map((a) => a.label)).toEqual(['b', 'a', 'd', 'c'])
  })
})

describe('long-distance stats', () => {
  const trip = (lineName: string, delayMin: number | null, actualDurationMin: number | null = null, number = '1') =>
    ({ mode: 'long', longType: 'train', company: 'MÁV', lineType: 'IC', lineName, number, delayMin, durationMin: 60, actualDurationMin }) as Trip
  it('uses the actual duration for elapsed time when known', () => {
    expect(elapsedMin(trip('1', null, 75))).toBe(75)
    expect(elapsedMin(trip('1', null))).toBe(60)
  })
  it('groups lines by company, type and line name, never by service number', () => {
    expect(lineKey(trip('Tokaj', 0, null, '236'))?.[0]).toEqual(lineKey(trip('Tokaj', 5, null, '238'))?.[0])
    expect(lineKey(trip('Tokaj', 0))?.[0].label).toBe('MÁV IC Tokaj')
    expect(lineKey(trip('', 0))?.[0].label).toBe('MÁV IC')
    expect(lineKey({ ...trip('', 0), lineType: '' } as Trip)?.[0].label).toBe('MÁV')
    expect(lineKey(trip('Tokaj', 0))?.[0].key).not.toBe(lineKey(trip('Hernád', 0))?.[0].key)
  })
  it('averages delays, counts on-time trips and ranks lines by average delay', () => {
    const s = delayStats([trip('1', 10), trip('1', 20), trip('2', -2), trip('2', 5), trip('3', null)], (t) => (t.mode === 'long' ? t.lineName : ''))
    expect(s).toMatchObject({ count: 4, avg: 8.25, onTime: 2, max: 20 })
    expect(s.byLine.map((l) => [l.label, l.avg])).toEqual([['1', 15], ['2', 1.5]])
  })
})

describe('byWeekday', () => {
  it('buckets trips Monday first and keeps empty days', () => {
    const d = (date: string) => ({ date, mode: 'city', durationMin: 10 }) as unknown as Trip
    const w = byWeekday([d('2026-11-23'), d('2026-11-29'), d('2026-11-30')])
    expect(w.map((x) => x.count)).toEqual([2, 0, 0, 0, 0, 0, 1])
  })
})
