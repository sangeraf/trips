import type { Dataset, Mode, Person, Trip, VehicleType, VehicleUnit } from '../db/types'
import i18n from 'i18next'
import { normalize } from './text'

export interface Filter {
  from: string
  to: string
  mode: Mode | ''
}

export function filterTrips(trips: Trip[], f: Filter): Trip[] {
  return trips.filter(
    (t) => !t.deleted && (!f.mode || t.mode === f.mode) && (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to),
  )
}

export interface Agg {
  key: string
  label: string
  count: number
  minutes: number
  /** Trips with a known duration: the base of the average. */
  timed: number
  km: number
  first: string
  last: string
}

const emptyAgg = (key: string, label: string): Agg => ({ key, label, count: 0, minutes: 0, timed: 0, km: 0, first: '', last: '' })

/** Time spent: the actual duration of a long-distance trip when known, otherwise the (scheduled) duration. */
export const elapsedMin = (t: Trip) => (t.mode === 'long' ? (t.actualDurationMin ?? t.durationMin) : t.durationMin)

function add(a: Agg, t: Trip) {
  const min = elapsedMin(t)
  a.count++
  a.minutes += min ?? 0
  if (min != null) a.timed++
  a.km += t.mode === 'city' ? 0 : (t.distanceKm ?? 0)
  if (!a.first || t.date < a.first) a.first = t.date
  if (!a.last || t.date > a.last) a.last = t.date
}

export function summarize(trips: Trip[]): Agg {
  const a = emptyAgg('all', '')
  for (const t of trips) add(a, t)
  return a
}

/** Aggregates trips by one or more keys per trip, sorted by trip count. */
export function groupBy(trips: Trip[], keys: (t: Trip) => { key: string; label: string }[] | null): Agg[] {
  const m = new Map<string, Agg>()
  for (const t of trips) {
    for (const k of keys(t) ?? []) {
      if (!k.key) continue
      const a = m.get(k.key) ?? emptyAgg(k.key, k.label)
      add(a, t)
      m.set(k.key, a)
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes || a.label.localeCompare(b.label))
}

export const one = (key: string, label = key) => [{ key, label }]

export const subtypeOf = (t: Trip) => (t.mode === 'car' ? t.carType : t.mode === 'city' ? t.transitType : t.longType)

export function lineKey(t: Trip) {
  if (t.mode === 'long') {
    const name = t.lineName ?? ''
    if (!t.company && !t.lineType && !name) return null
    const label = [t.company, t.lineType, name].filter(Boolean).join(' ')
    return one(`long|${t.longType}|${normalize(t.company)}|${normalize(t.lineType)}|${normalize(name)}`, label)
  }
  if (t.mode !== 'city' || !t.line) return null
  return one(`${t.city.toLowerCase()}|${t.transitType}|${t.line.toLowerCase()}`, t.line)
}

export interface DelayStats {
  count: number
  avg: number
  onTime: number
  max: number
  byLine: { key: string; label: string; count: number; avg: number }[]
}

/** Up to this many minutes late still counts as on time (the usual railway threshold). */
export const ON_TIME_MIN = 5

export function delayStats(trips: Trip[], label: (t: Trip) => string): DelayStats {
  const timed = trips.filter((t) => t.mode === 'long' && t.delayMin != null) as (Trip & { delayMin: number })[]
  const lines = new Map<string, { key: string; label: string; count: number; sum: number }>()
  for (const t of timed) {
    const k = lineKey(t)?.[0]
    if (!k) continue
    const g = lines.get(k.key) ?? { key: k.key, label: label(t), count: 0, sum: 0 }
    g.count++
    g.sum += t.delayMin
    lines.set(k.key, g)
  }
  const sum = timed.reduce((n, t) => n + t.delayMin, 0)
  return {
    count: timed.length,
    avg: timed.length ? sum / timed.length : 0,
    onTime: timed.filter((t) => t.delayMin <= ON_TIME_MIN).length,
    max: Math.max(0, ...timed.map((t) => t.delayMin)),
    byLine: [...lines.values()].map((g) => ({ ...g, avg: g.sum / g.count })).sort((a, b) => b.avg - a.avg || b.count - a.count),
  }
}

export function routeKey(t: Trip) {
  const [a, b] = t.mode === 'car' ? [t.startPlace, t.endPlace] : [t.from, t.to]
  if (!a && !b) return null
  return one(`${t.mode}|${a.toLowerCase()}|${b.toLowerCase()}`, `${a || '?'} → ${b || '?'}`)
}

export function placeKeys(t: Trip) {
  const places = t.mode === 'car' ? [t.startPlace, t.endPlace] : [t.from, t.to]
  return places.filter(Boolean).map((p) => ({ key: `${t.mode}|${p.toLowerCase()}`, label: p }))
}

export function byMonth(trips: Trip[]): Agg[] {
  return groupBy(trips, (t) => one(t.date.slice(0, 7))).sort((a, b) => a.key.localeCompare(b.key))
}

/** Seven aggregates, Monday first (key '0') to Sunday ('6'), including empty days. */
export function byWeekday(trips: Trip[]): Agg[] {
  const days = Array.from({ length: 7 }, (_, i) => emptyAgg(String(i), ''))
  for (const t of trips) {
    if (!t.date) continue
    add(days[(new Date(`${t.date}T12:00:00`).getDay() + 6) % 7], t)
  }
  return days
}

export interface PersonStats extends Agg {
  person: Person
  perMode: Record<Mode, number>
  driven: number
}

export function peopleStats(trips: Trip[], people: Person[]): PersonStats[] {
  const byId = new Map<string, PersonStats>()
  for (const p of people) {
    if (p.deleted) continue
    byId.set(p.id, { ...emptyAgg(p.id, p.name), person: p, perMode: { car: 0, city: 0, long: 0 }, driven: 0 })
  }
  for (const t of trips) {
    if (t.deleted) continue
    for (const id of new Set(t.companionIds)) {
      const s = byId.get(id)
      if (!s) continue
      add(s, t)
      s.perMode[t.mode]++
    }
    if (t.mode === 'car' && t.carType === 'personal' && t.driverId) {
      const s = byId.get(t.driverId)
      if (s) s.driven++
    }
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes || a.label.localeCompare(b.label))
}

export interface UnitStats extends Agg {
  unit: VehicleUnit
  /** HÉV only, labels are the stored values. */
  carriages: Agg[]
  seatColors: Agg[]
}

export interface TypeStats extends Agg {
  type: VehicleType
  units: UnitStats[]
  lines: Agg[]
}

export function vehicleStats(ds: Pick<Dataset, 'trips' | 'vehicleTypes' | 'vehicleUnits'>): TypeStats[] {
  const trips = ds.trips.filter((t) => !t.deleted)
  const byUnit = new Map<string, Trip[]>()
  for (const t of trips) {
    if (!t.vehicleUnitId) continue
    const list = byUnit.get(t.vehicleUnitId) ?? []
    list.push(t)
    byUnit.set(t.vehicleUnitId, list)
  }
  return ds.vehicleTypes
    .filter((t) => !t.deleted)
    .map((type) => {
      const units = ds.vehicleUnits
        .filter((u) => !u.deleted && u.vehicleTypeId === type.id)
        .map((unit) => {
          const list = byUnit.get(unit.id) ?? []
          return {
            ...summarize(list),
            key: unit.id,
            label: unit.licence,
            unit,
            carriages: groupBy(list, (t) => (t.mode === 'city' && t.carriage ? one(normalize(t.carriage), t.carriage) : null)),
            seatColors: groupBy(list, (t) => (t.mode === 'city' && t.seatColor ? one(normalize(t.seatColor), t.seatColor) : null)),
          }
        })
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      const typeTrips = units.flatMap((u) => byUnit.get(u.unit.id) ?? [])
      return {
        ...summarize(typeTrips),
        key: type.id,
        label: `${type.manufacturer} ${type.model}`.trim(),
        type,
        units,
        lines: groupBy(typeTrips, lineKey),
      }
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** Average minutes per timed trip, or null when no trip has a duration. */
export const avgMin = (a: Agg) => (a.timed ? a.minutes / a.timed : null)

/** The number a ranking is ordered by. */
export const rankValue = (a: Agg, by: RankBy) =>
  by === 'count' ? a.count : by === 'time' ? a.minutes : by === 'distance' ? a.km : (avgMin(a) ?? 0)

export const RANKS = ['count', 'time', 'avgAsc', 'avgDesc'] as const
/** Stats page ranks; distance ignores city transport, which has no distance. */
export const STATS_RANKS = [...RANKS, 'distance'] as const
export type RankBy = (typeof STATS_RANKS)[number]
export const SORTS = ['abc', ...RANKS] as const
export type SortBy = (typeof SORTS)[number]

/** A–Z ascending (unnamed last), count / time descending, or average either way (no average last). */
export function sortAgg<T extends Agg>(list: T[], by: SortBy | 'distance'): T[] {
  const avg = (dir: number) => (a: T, b: T) => {
    const x = avgMin(a)
    const y = avgMin(b)
    if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0) || b.count - a.count
    return dir * (x - y) || b.count - a.count
  }
  const cmp: Record<SortBy | 'distance', (a: T, b: T) => number> = {
    abc: (a, b) => (!a.label ? 1 : 0) - (!b.label ? 1 : 0) || a.label.localeCompare(b.label, i18n.language, { numeric: true }),
    count: (a, b) => b.count - a.count || b.minutes - a.minutes,
    time: (a, b) => b.minutes - a.minutes || b.count - a.count,
    avgAsc: avg(1),
    avgDesc: avg(-1),
    distance: (a, b) => b.km - a.km || b.count - a.count,
  }
  return [...list].sort(cmp[by])
}
