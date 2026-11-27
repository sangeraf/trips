export type Mode = 'car' | 'city' | 'long'
export const MODES: Mode[] = ['car', 'city', 'long']

export type CarType = 'taxi' | 'personal'
export const CAR_TYPES: CarType[] = ['taxi', 'personal']

export type CityType = 'metro' | 'tram' | 'trolleybus' | 'bus' | 'commuter'
export const CITY_TYPES: CityType[] = ['metro', 'tram', 'trolleybus', 'bus', 'commuter']

export type LongType = 'train' | 'coach'
export const LONG_TYPES: LongType[] = ['train', 'coach']

export const HEV_CARRIAGES = ['1', '2', '3']
export const SEAT_COLORS = ['brown', 'red', 'blue', 'mav', 'new']
export const BUS_BODY_TYPES = ['standard', 'articulated']
export const hasBodyType = (subtype: string | null | undefined) => subtype === 'bus' || subtype === 'trolleybus'

/** Rail vehicles and trolleybuses carry a registration number ("pályaszám"), road vehicles a licence plate. */
export function plateKind(mode: Mode, subtype: string): 'licence' | 'reg' {
  return (mode === 'city' && subtype !== 'bus') || (mode === 'long' && subtype === 'train') ? 'reg' : 'licence'
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
  /** HH:MM; scheduled times for long-distance trips */
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
  /** HÉV only: carriage position (HEV_CARRIAGES) or ''. */
  carriage?: string
  /** HÉV only: a SEAT_COLORS key or ''. */
  seatColor?: string
}

/** Long distance: TripBase times and duration are the scheduled ones. */
export interface LongTrip extends TripBase {
  mode: 'long'
  longType: LongType
  company: string
  /** e.g. InterCity, regional */
  lineType: string
  number: string
  from: string
  to: string
  distanceKm: number | null
  actualDeparture: string
  actualArrival: string
  actualDurationMin: number | null
  actualDurationManual: boolean
  /** Actual minus scheduled arrival in minutes; negative when early. */
  delayMin: number | null
}

export type Trip = CarTrip | CityTrip | LongTrip

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

export function vehicleSubtype(trip: Pick<Trip, 'mode'> & { transitType?: CityType; longType?: LongType }): string {
  return trip.mode === 'city' ? (trip.transitType ?? '') : trip.mode === 'long' ? (trip.longType ?? '') : ''
}
