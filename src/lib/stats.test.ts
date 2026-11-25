import { describe, expect, it } from 'vitest'
import { sortAgg, type Agg } from './stats'

const agg = (label: string, count: number, minutes: number): Agg => ({ key: label, label, count, minutes, km: 0, first: '', last: '' })

describe('sortAgg', () => {
  const list = [agg('b', 1, 90), agg('', 5, 10), agg('A10', 3, 30), agg('A9', 2, 60)]
  it('sorts A–Z with numbers in order and unnamed last', () => {
    expect(sortAgg(list, 'abc').map((a) => a.label)).toEqual(['A9', 'A10', 'b', ''])
  })
  it('sorts by count or time descending', () => {
    expect(sortAgg(list, 'count').map((a) => a.count)).toEqual([5, 3, 2, 1])
    expect(sortAgg(list, 'time').map((a) => a.minutes)).toEqual([90, 60, 30, 10])
  })
})
