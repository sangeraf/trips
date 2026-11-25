export type Mode = 'car' | 'city'
export const MODES: Mode[] = ['car', 'city']

export type CarType = 'taxi' | 'personal'
export const CAR_TYPES: CarType[] = ['taxi', 'personal']

export type CityType = 'metro' | 'tram' | 'trolleybus' | 'bus' | 'commuter'
export const CITY_TYPES: CityType[] = ['metro', 'tram', 'trolleybus', 'bus', 'commuter']

export const BUS_BODY_TYPES = ['standard', 'articulated']
export const hasBodyType = (subtype: string | null | undefined) => subtype === 'bus' || subtype === 'trolleybus'

/** Rail vehicles and trolleybuses carry a registration number ("pályaszám"), road vehicles a licence plate. */
export function plateKind(mode: Mode, subtype: string): 'licence' | 'reg' {
  return mode === 'city' && subtype !== 'bus' ? 'reg' : 'licence'
}

/** Every synced record carries these fields; `deleted` records are tombstones kept so deletions sync. */
export interface SyncRecord {
  id: string
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

interface TripBase extends SyncRecord {
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  departureTime: string
  /** HH:MM */
  arrivalTime: string
  durationMin: number | null
  durationManual: boolean
  vehicleUnitId: string | null
  companionIds: string[]
  notes: string
}

export interface CarTrip extends TripBase {
  mode: 'car'
  carType: CarType
  city: string
  company: string
  driverId: string | null
  startPlace: string
  endPlace: string
  distanceKm: number | null
}

export interface CityTrip extends TripBase {
  mode: 'city'
  transitType: CityType
  city: string
  line: string
  from: string
  to: string
}

export type Trip = CarTrip | CityTrip

/** Car vehicles form one pool (subtype ''); city vehicles are grouped by transit type. */
export interface VehicleType extends SyncRecord {
  mode: Mode
  subtype: string
  manufacturer: string
  model: string
  /** Buses and trolleybuses only: a built-in key from BUS_BODY_TYPES or a custom name as typed. */
  bodyType: string
}

export interface VehicleUnit extends SyncRecord {
  vehicleTypeId: string
  licence: string
}

export interface Person extends SyncRecord {
  name: string
}

export interface Dataset {
  trips: Trip[]
  vehicleTypes: VehicleType[]
  vehicleUnits: VehicleUnit[]
  people: Person[]
}

export function vehicleSubtype(trip: Pick<Trip, 'mode'> & { transitType?: CityType }): string {
  return trip.mode === 'city' ? (trip.transitType ?? '') : ''
}
