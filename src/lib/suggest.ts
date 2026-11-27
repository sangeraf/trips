import type { Mode, Trip } from '../db/types'
import { normalize } from './text'

export interface Option<T = unknown> {
  value: string
  label?: string
  hint?: string
  count: number
  /** Ranked above everything with a lower boost, e.g. stops of the currently selected city. */
  boost?: number
  data?: T
}

/** Groups values by their normalized form and keeps the most used spelling. */
export function countValues(entries: { value: string; boost?: number }[]): Option[] {
  const groups = new Map<string, { spellings: Map<string, number>; count: number; boost: number }>()
  for (const { value, boost = 0 } of entries) {
    const v = value.trim()
    if (!v) continue
    const k = normalize(v)
    const g = groups.get(k) ?? { spellings: new Map(), count: 0, boost: 0 }
    g.count++
    g.boost = Math.max(g.boost, boost)
    g.spellings.set(v, (g.spellings.get(v) ?? 0) + 1)
    groups.set(k, g)
  }
  return [...groups.values()].map((g) => ({
    value: [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
    count: g.count,
    boost: g.boost,
  }))
}

export function filterOptions<T>(options: Option<T>[], query: string, limit = 8): Option<T>[] {
  const q = normalize(query)
  const scored = options
    .map((o) => {
      const text = normalize(`${o.value} ${o.label ?? ''}`)
      const words = text.split(' ')
      const rank = !q ? 1 : text.startsWith(q) ? 3 : words.some((w) => w.startsWith(q)) ? 2 : text.includes(q) ? 1 : 0
      return { o, rank }
    })
    .filter((x) => x.rank > 0)
  scored.sort(
    (a, b) =>
      (b.o.boost ?? 0) - (a.o.boost ?? 0) || b.rank - a.rank || b.o.count - a.o.count || a.o.value.localeCompare(b.o.value),
  )
  return scored.slice(0, limit).map((x) => x.o)
}

const sameMode = (trips: Trip[], mode: Mode) => trips.filter((t) => !t.deleted && t.mode === mode)
const boostIf = (cond: boolean) => (cond ? 1 : 0)

/** Places used before in the same mode; for city transport stops of the selected city come first. */
export function placeOptions(trips: Trip[], mode: Mode, city = ''): Option[] {
  const c = normalize(city)
  return countValues(
    sameMode(trips, mode).flatMap((t) => {
      if (t.mode === 'car') return [{ value: t.startPlace }, { value: t.endPlace }]
      const boost = boostIf(!!c && t.mode === 'city' && normalize(t.city) === c)
      return [
        { value: t.from, boost },
        { value: t.to, boost },
      ]
    }),
  )
}

export function cityOptions(trips: Trip[], mode: Mode): Option[] {
  return countValues(sameMode(trips, mode).map((t) => ({ value: t.mode === 'long' ? '' : t.city })))
}

export function lineOptions(trips: Trip[], city: string, transitType: string): Option[] {
  const c = normalize(city)
  return countValues(
    sameMode(trips, 'city').flatMap((t) =>
      t.mode === 'city' && (!c || normalize(t.city) === c)
        ? [{ value: t.line, boost: boostIf(t.transitType === transitType) }]
        : [],
    ),
  )
}

/** Long-distance company, line type or number; values from the same train/coach type come first. */
export function longOptions(trips: Trip[], field: 'company' | 'lineType' | 'number', longType: string, company = ''): Option[] {
  const c = normalize(company)
  return countValues(
    sameMode(trips, 'long').flatMap((t) =>
      t.mode === 'long'
        ? [{ value: t[field], boost: boostIf(t.longType === longType) + boostIf(!!c && field !== 'company' && normalize(t.company) === c) }]
        : [],
    ),
  )
}

export function companyOptions(trips: Trip[], city: string): Option[] {
  const c = normalize(city)
  return countValues(
    sameMode(trips, 'car').flatMap((t) =>
      t.mode === 'car' && t.carType === 'taxi' ? [{ value: t.company, boost: boostIf(!!c && normalize(t.city) === c) }] : [],
    ),
  )
}
