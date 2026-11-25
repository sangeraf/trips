import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { Dataset } from '../db/types'
import { formatDuration } from './duration'

export function exportJson(ds: Dataset): string {
  return JSON.stringify({ app: 'trips', format: 1, exportedAt: new Date().toISOString(), ...ds }, null, 1)
}

export function parseBackup(text: string): Dataset {
  const j = JSON.parse(text) as Partial<Dataset>
  if (!Array.isArray(j.trips)) throw new Error('Not a trips backup file')
  return { trips: j.trips, vehicleTypes: j.vehicleTypes ?? [], vehicleUnits: j.vehicleUnits ?? [], people: j.people ?? [] }
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One row per trip with vehicles and people resolved to names. */
export function exportCsv(ds: Dataset): string {
  const people = new Map(ds.people.map((p) => [p.id, p.name]))
  const units = new Map(ds.vehicleUnits.map((u) => [u.id, u]))
  const types = new Map(ds.vehicleTypes.map((t) => [t.id, t]))
  const header = [
    'date', 'mode', 'subtype', 'city', 'line', 'company', 'driver', 'from', 'to', 'departure', 'arrival',
    'duration', 'distance_km', 'manufacturer', 'model', 'body_type', 'licence', 'companions', 'notes',
  ]
  const rows = ds.trips
    .filter((t) => !t.deleted)
    .sort((a, b) => a.date.localeCompare(b.date) || a.departureTime.localeCompare(b.departureTime))
    .map((t) => {
      const unit = t.vehicleUnitId ? units.get(t.vehicleUnitId) : undefined
      const type = unit ? types.get(unit.vehicleTypeId) : undefined
      const car = t.mode === 'car'
      return [
        t.date,
        t.mode,
        car ? t.carType : t.transitType,
        t.city,
        car ? '' : t.line,
        car ? t.company : '',
        car && t.driverId ? people.get(t.driverId) : '',
        car ? t.startPlace : t.from,
        car ? t.endPlace : t.to,
        t.departureTime,
        t.arrivalTime,
        formatDuration(t.durationMin),
        car ? t.distanceKm : '',
        type?.manufacturer,
        type?.model,
        type?.bodyType,
        unit?.licence,
        t.companionIds.map((id) => people.get(id)).join(', '),
        t.notes,
      ].map(csvCell).join(',')
    })
  return [header.join(','), ...rows].join('\n') + '\n'
}

/** Downloads in the browser; on Android writes to the cache and opens the share sheet. */
export async function saveFile(name: string, text: string, mime: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: name, url: uri })
    return
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
