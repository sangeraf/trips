import { describe, expect, it } from 'vitest'
import { avgMin, sortAgg, type Agg } from './stats'

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
