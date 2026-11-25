import { normalize } from '../lib/text'
import type { Dataset, Person, SyncRecord, Trip, VehicleType, VehicleUnit } from './types'

/** Last-writer-wins merge by id. On equal timestamps a tombstone wins so deletions are never lost. */
export function mergeLww<T extends SyncRecord>(a: T[], b: T[]): T[] {
  const byId = new Map<string, T>()
  for (const r of a) byId.set(r.id, r)
  for (const r of b) {
    const cur = byId.get(r.id)
    if (!cur || r.updatedAt > cur.updatedAt || (r.updatedAt === cur.updatedAt && r.deleted && !cur.deleted)) {
      byId.set(r.id, r)
    }
  }
  return [...byId.values()]
}

export function mergeDatasets(a: Dataset, b: Dataset): Dataset {
  return {
    trips: mergeLww(a.trips, b.trips),
    vehicleTypes: mergeLww(a.vehicleTypes, b.vehicleTypes),
    vehicleUnits: mergeLww(a.vehicleUnits, b.vehicleUnits),
    people: mergeLww(a.people, b.people),
  }
}

export const typeKey = (t: Pick<VehicleType, 'mode' | 'subtype' | 'manufacturer' | 'model' | 'bodyType'>) =>
  [t.mode, t.subtype, normalize(t.manufacturer), normalize(t.model), normalize(t.bodyType ?? '')].join('|')
export const unitKey = (u: Pick<VehicleUnit, 'vehicleTypeId' | 'licence'>) =>
  `${u.vehicleTypeId}|${normalize(u.licence).replace(/[\s-]/g, '')}`
export const personKey = (p: Pick<Person, 'name'>) => normalize(p.name)

const older = (a: SyncRecord, b: SyncRecord) =>
  a.createdAt !== b.createdAt ? a.createdAt < b.createdAt : a.id < b.id

/**
 * Collapses records with the same natural key into the oldest one and returns the losers' id mapping.
 * The choice is deterministic so two devices deduplicating the same data agree.
 */
function collapse<T extends SyncRecord>(
  records: T[],
  key: (r: T) => string,
  now: number,
  changed: Map<string, T>,
): Map<string, string> {
  const keep = new Map<string, T>()
  for (const r of records) {
    if (r.deleted) continue
    const k = key(r)
    const cur = keep.get(k)
    if (!cur || older(r, cur)) keep.set(k, r)
  }
  const remap = new Map<string, string>()
  for (const r of records) {
    if (r.deleted) continue
    const winner = keep.get(key(r))!
    if (winner.id !== r.id) {
      remap.set(r.id, winner.id)
      changed.set(r.id, { ...r, deleted: true, updatedAt: now })
    }
  }
  return remap
}

export interface DedupeResult {
  dataset: Dataset
  changed: { trips: Trip[]; vehicleTypes: VehicleType[]; vehicleUnits: VehicleUnit[]; people: Person[] }
}

/** Merges duplicate people, vehicle types and licences (e.g. created offline on two devices) and relinks trips. */
export function dedupe(ds: Dataset, now = Date.now()): DedupeResult {
  const people = new Map<string, Person>()
  const personMap = collapse(ds.people, personKey, now, people)

  const types = new Map<string, VehicleType>()
  const typeMap = collapse(ds.vehicleTypes, typeKey, now, types)

  const units = new Map<string, VehicleUnit>()
  const relinkedUnits = ds.vehicleUnits.map((u) => {
    const target = typeMap.get(u.vehicleTypeId)
    if (!target || u.deleted) return u
    const nu = { ...u, vehicleTypeId: target, updatedAt: now }
    units.set(u.id, nu)
    return nu
  })
  const unitMap = collapse(relinkedUnits, unitKey, now, units)

  const trips = new Map<string, Trip>()
  for (const t of ds.trips) {
    if (t.deleted) continue
    let next = t
    const unit = t.vehicleUnitId ? unitMap.get(t.vehicleUnitId) : undefined
    if (unit) next = { ...next, vehicleUnitId: unit }
    if (next.mode === 'car' && next.driverId && personMap.has(next.driverId)) {
      next = { ...next, driverId: personMap.get(next.driverId)! }
    }
    if (t.companionIds.some((id) => personMap.has(id))) {
      next = { ...next, companionIds: [...new Set(t.companionIds.map((id) => personMap.get(id) ?? id))] }
    }
    if (next !== t) trips.set(t.id, { ...next, updatedAt: now })
  }

  const apply = <T extends SyncRecord>(list: T[], ch: Map<string, T>) => list.map((r) => ch.get(r.id) ?? r)
  return {
    dataset: {
      trips: apply(ds.trips, trips),
      vehicleTypes: apply(ds.vehicleTypes, types),
      vehicleUnits: apply(ds.vehicleUnits, units),
      people: apply(ds.people, people),
    },
    changed: {
      trips: [...trips.values()],
      vehicleTypes: [...types.values()],
      vehicleUnits: [...units.values()],
      people: [...people.values()],
    },
  }
}
