import Dexie, { type EntityTable } from 'dexie'
import type { Person, Trip, VehicleType, VehicleUnit } from './types'

export class TripsDb extends Dexie {
  trips!: EntityTable<Trip, 'id'>
  vehicleTypes!: EntityTable<VehicleType, 'id'>
  vehicleUnits!: EntityTable<VehicleUnit, 'id'>
  people!: EntityTable<Person, 'id'>

  constructor(name = 'trips') {
    super(name)
    this.version(1).stores({
      trips: 'id, mode, date, updatedAt',
      vehicleTypes: 'id, mode, updatedAt',
      vehicleUnits: 'id, vehicleTypeId, updatedAt',
      people: 'id, updatedAt',
    })
  }
}

export const db = new TripsDb()

type Listener = () => void
const listeners = new Set<Listener>()

/** Notifies subscribers (the auto-sync) that local data changed. */
export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitLocalChange(): void {
  for (const fn of listeners) fn()
}
