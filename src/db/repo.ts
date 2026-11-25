import { calcDuration } from '../lib/duration'
import { clean, newId, normalize, todayIso } from '../lib/text'
import { db, emitLocalChange, type TripsDb } from './db'
import { dedupe, mergeDatasets, personKey, typeKey, unitKey } from './merge'
import {
  vehicleSubtype,
  type CarType,
  type CityType,
  type Dataset,
  type Mode,
  type Person,
  type SyncRecord,
  type Trip,
  type VehicleType,
  type VehicleUnit,
  hasBodyType,
} from './types'

/** Editable form state; vehicles and people are entered as text and resolved to ids on save. */
export interface TripDraft {
  id?: string
  createdAt?: number
  mode: Mode
  date: string
  departureTime: string
  arrivalTime: string
  durationMin: number | null
  durationManual: boolean
  manufacturer: string
  model: string
  licence: string
  bodyType: string
  companions: string[]
  notes: string
  carType: CarType
  driver: string
  startPlace: string
  endPlace: string
  distanceKm: number | null
  company: string
  transitType: CityType
  city: string
  line: string
  from: string
  to: string
}

export function emptyDraft(mode: Mode): TripDraft {
  return {
    mode,
    date: todayIso(),
    departureTime: '',
    arrivalTime: '',
    durationMin: null,
    durationManual: false,
    manufacturer: '',
    model: '',
    licence: '',
    bodyType: '',
    companions: [],
    notes: '',
    carType: 'personal',
    driver: '',
    startPlace: '',
    endPlace: '',
    distanceKm: null,
    company: '',
    transitType: 'bus',
    city: '',
    line: '',
    from: '',
    to: '',
  }
}

export const alive = <T extends SyncRecord>(r: T | undefined): T | undefined => (r && !r.deleted ? r : undefined)

export async function loadAll(d: TripsDb = db): Promise<Dataset> {
  const [trips, vehicleTypes, vehicleUnits, people] = await Promise.all([
    d.trips.toArray(),
    d.vehicleTypes.toArray(),
    d.vehicleUnits.toArray(),
    d.people.toArray(),
  ])
  return { trips, vehicleTypes, vehicleUnits, people }
}

export function tripToDraft(trip: Trip, ds: Pick<Dataset, 'vehicleTypes' | 'vehicleUnits' | 'people'>): TripDraft {
  const unit = ds.vehicleUnits.find((u) => u.id === trip.vehicleUnitId)
  const type = unit && ds.vehicleTypes.find((t) => t.id === unit.vehicleTypeId)
  const name = (id: string) => ds.people.find((p) => p.id === id)?.name ?? ''
  const driverId = trip.mode === 'car' && trip.carType === 'personal' ? trip.driverId : null
  const base = emptyDraft(trip.mode)
  const common = {
    ...base,
    id: trip.id,
    createdAt: trip.createdAt,
    date: trip.date,
    departureTime: trip.departureTime,
    arrivalTime: trip.arrivalTime,
    durationMin: trip.durationMin,
    durationManual: trip.durationManual,
    manufacturer: type?.manufacturer ?? '',
    model: type?.model ?? '',
    licence: unit?.licence ?? '',
    bodyType: type?.bodyType ?? '',
    companions: trip.companionIds.filter((id) => id !== driverId).map(name).filter(Boolean),
    notes: trip.notes,
  }
  if (trip.mode === 'car') {
    return {
      ...common,
      carType: trip.carType,
      driver: trip.driverId ? name(trip.driverId) : '',
      startPlace: trip.startPlace,
      endPlace: trip.endPlace,
      distanceKm: trip.distanceKm,
      city: trip.city,
      company: trip.company,
    }
  }
  return { ...common, transitType: trip.transitType, city: trip.city, line: trip.line, from: trip.from, to: trip.to }
}

async function resolvePerson(d: TripsDb, rawName: string, now: number): Promise<string | null> {
  const name = clean(rawName)
  if (!name) return null
  const key = personKey({ name })
  const existing = (await d.people.toArray()).find((p) => !p.deleted && personKey(p) === key)
  if (existing) return existing.id
  const p: Person = { id: newId(), name, createdAt: now, updatedAt: now }
  await d.people.add(p)
  return p.id
}

async function resolveVehicle(
  d: TripsDb,
  mode: Mode,
  subtype: string,
  manufacturer: string,
  model: string,
  licence: string,
  bodyType: string,
  now: number,
): Promise<string | null> {
  const t = {
    mode,
    subtype,
    manufacturer: clean(manufacturer),
    model: clean(model),
    bodyType: hasBodyType(subtype) ? clean(bodyType) : '',
  }
  const lic = clean(licence).toUpperCase()
  if (!t.manufacturer && !t.model && !t.bodyType && !lic) return null
  const tk = typeKey(t)
  let type = (await d.vehicleTypes.where('mode').equals(mode).toArray()).find((x) => !x.deleted && typeKey(x) === tk)
  if (!type) {
    type = { id: newId(), ...t, createdAt: now, updatedAt: now }
    await d.vehicleTypes.add(type)
  }
  const uk = unitKey({ vehicleTypeId: type.id, licence: lic })
  let unit = (await d.vehicleUnits.where('vehicleTypeId').equals(type.id).toArray()).find(
    (u) => !u.deleted && unitKey(u) === uk,
  )
  if (!unit) {
    unit = { id: newId(), vehicleTypeId: type.id, licence: lic, createdAt: now, updatedAt: now }
    await d.vehicleUnits.add(unit)
  }
  return unit.id
}

export async function saveTrip(draft: TripDraft, d: TripsDb = db): Promise<Trip> {
  const now = Date.now()
  const trip = await d.transaction('rw', [d.trips, d.vehicleTypes, d.vehicleUnits, d.people], async () => {
    const subtype = vehicleSubtype(draft)
    const vehicleUnitId = await resolveVehicle(
      d,
      draft.mode,
      subtype,
      draft.manufacturer,
      draft.model,
      draft.licence,
      draft.bodyType,
      now,
    )
    const isPersonalCar = draft.mode === 'car' && draft.carType === 'personal'
    const driverId = isPersonalCar ? await resolvePerson(d, draft.driver, now) : null
    const companionIds: string[] = driverId ? [driverId] : []
    for (const name of draft.companions) {
      const id = await resolvePerson(d, name, now)
      if (id && !companionIds.includes(id)) companionIds.push(id)
    }
    const computed = calcDuration(draft.departureTime, draft.arrivalTime)
    const durationManual = draft.durationManual && draft.durationMin !== null
    const base = {
      id: draft.id ?? newId(),
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
      date: draft.date,
      departureTime: draft.departureTime,
      arrivalTime: draft.arrivalTime,
      durationMin: durationManual ? draft.durationMin : computed,
      durationManual,
      vehicleUnitId,
      companionIds,
      notes: draft.notes.trim(),
    }
    const t: Trip =
      draft.mode === 'car'
        ? {
            ...base,
            mode: 'car',
            carType: draft.carType,
            city: draft.carType === 'taxi' ? clean(draft.city) : '',
            company: draft.carType === 'taxi' ? clean(draft.company) : '',
            driverId,
            startPlace: clean(draft.startPlace),
            endPlace: clean(draft.endPlace),
            distanceKm: draft.distanceKm,
          }
        : {
            ...base,
            mode: 'city',
            transitType: draft.transitType,
            city: clean(draft.city),
            line: clean(draft.line),
            from: clean(draft.from),
            to: clean(draft.to),
          }
    await d.trips.put(t)
    return t
  })
  emitLocalChange()
  return trip
}

export async function deleteTrip(id: string, d: TripsDb = db): Promise<void> {
  await d.trips.update(id, { deleted: true, updatedAt: Date.now() })
  emitLocalChange()
}

/** Runs the duplicate merge over the whole database; used after renames and after sync. */
export async function runDedupe(d: TripsDb = db): Promise<void> {
  await d.transaction('rw', [d.trips, d.vehicleTypes, d.vehicleUnits, d.people], async () => {
    const { changed } = dedupe(await loadAll(d))
    await Promise.all([
      d.trips.bulkPut(changed.trips),
      d.vehicleTypes.bulkPut(changed.vehicleTypes),
      d.vehicleUnits.bulkPut(changed.vehicleUnits),
      d.people.bulkPut(changed.people),
    ])
  })
}

/** Returns the live type that would be merged into if `id` were renamed. */
export function findTypeCollision(
  types: VehicleType[],
  id: string,
  manufacturer: string,
  model: string,
  bodyType: string,
): VehicleType | undefined {
  const self = types.find((t) => t.id === id)
  if (!self) return undefined
  const k = typeKey({ ...self, manufacturer, model, bodyType })
  return types.find((t) => !t.deleted && t.id !== id && typeKey(t) === k)
}

export function findUnitCollision(
  units: VehicleUnit[],
  id: string,
  vehicleTypeId: string,
  licence: string,
): VehicleUnit | undefined {
  const k = unitKey({ vehicleTypeId, licence })
  return units.find((u) => !u.deleted && u.id !== id && unitKey(u) === k)
}

export function findPersonCollision(people: Person[], id: string, name: string): Person | undefined {
  const k = normalize(name)
  return people.find((p) => !p.deleted && p.id !== id && personKey(p) === k)
}

export async function updateVehicleType(
  id: string,
  manufacturer: string,
  model: string,
  bodyType: string,
  d: TripsDb = db,
): Promise<void> {
  await d.vehicleTypes.update(id, {
    manufacturer: clean(manufacturer),
    model: clean(model),
    bodyType: clean(bodyType),
    updatedAt: Date.now(),
  })
  await runDedupe(d)
  emitLocalChange()
}

export async function updateVehicleUnit(
  id: string,
  patch: { licence?: string; vehicleTypeId?: string },
  d: TripsDb = db,
): Promise<void> {
  const p = { ...patch, updatedAt: Date.now() }
  if (p.licence !== undefined) p.licence = clean(p.licence).toUpperCase()
  await d.vehicleUnits.update(id, p)
  await runDedupe(d)
  emitLocalChange()
}

export async function renamePerson(id: string, name: string, d: TripsDb = db): Promise<void> {
  await d.people.update(id, { name: clean(name), updatedAt: Date.now() })
  await runDedupe(d)
  emitLocalChange()
}

/** Tombstones a record; callers only offer this for vehicles and people no live trip uses. */
export async function deleteRecord(
  table: 'vehicleTypes' | 'vehicleUnits' | 'people',
  id: string,
  d: TripsDb = db,
): Promise<void> {
  const now = Date.now()
  await d.transaction('rw', [d.vehicleTypes, d.vehicleUnits, d.people], async () => {
    await d[table].update(id, { deleted: true, updatedAt: now })
    if (table === 'vehicleTypes') {
      await d.vehicleUnits.where('vehicleTypeId').equals(id).modify({ deleted: true, updatedAt: now })
    }
  })
  emitLocalChange()
}

/** Merges a remote or imported dataset into the local database. Returns the merged dataset. */
export async function mergeIntoLocal(remote: Dataset, d: TripsDb = db): Promise<Dataset> {
  return d.transaction('rw', [d.trips, d.vehicleTypes, d.vehicleUnits, d.people], async () => {
    const local = await loadAll(d)
    const { dataset } = dedupe(mergeDatasets(local, remote))
    const changedOnly = <T extends SyncRecord>(merged: T[], before: T[]) => {
      const prev = new Map(before.map((r) => [r.id, r]))
      return merged.filter((r) => {
        const p = prev.get(r.id)
        return !p || p.updatedAt !== r.updatedAt || !!p.deleted !== !!r.deleted
      })
    }
    await Promise.all([
      d.trips.bulkPut(changedOnly(dataset.trips, local.trips)),
      d.vehicleTypes.bulkPut(changedOnly(dataset.vehicleTypes, local.vehicleTypes)),
      d.vehicleUnits.bulkPut(changedOnly(dataset.vehicleUnits, local.vehicleUnits)),
      d.people.bulkPut(changedOnly(dataset.people, local.people)),
    ])
    return dataset
  })
}

