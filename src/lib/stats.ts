import type { Dataset, Mode, Person, Trip, VehicleType, VehicleUnit } from '../db/types'

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
  km: number
  first: string
  last: string
}

const emptyAgg = (key: string, label: string): Agg => ({ key, label, count: 0, minutes: 0, km: 0, first: '', last: '' })

function add(a: Agg, t: Trip) {
  a.count++
  a.minutes += t.durationMin ?? 0
  a.km += t.mode === 'car' ? (t.distanceKm ?? 0) : 0
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

export const subtypeOf = (t: Trip) => (t.mode === 'car' ? t.carType : t.transitType)

export function lineKey(t: Trip) {
  if (t.mode !== 'city' || !t.line) return null
  return one(`${t.city.toLowerCase()}|${t.transitType}|${t.line.toLowerCase()}`, t.line)
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

export interface PersonStats extends Agg {
  person: Person
  perMode: Record<Mode, number>
  driven: number
}

export function peopleStats(trips: Trip[], people: Person[]): PersonStats[] {
  const byId = new Map<string, PersonStats>()
  for (const p of people) {
    if (p.deleted) continue
    byId.set(p.id, { ...emptyAgg(p.id, p.name), person: p, perMode: { car: 0, city: 0 }, driven: 0 })
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
        .map((unit) => ({ ...summarize(byUnit.get(unit.id) ?? []), key: unit.id, label: unit.licence, unit }))
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
