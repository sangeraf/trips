import { vehicleStats } from '../lib/stats'
import { beforeEach, describe, expect, it } from 'vitest'
import { exportCsv, exportJson, parseBackup } from '../lib/backup'
import { TripsDb } from './db'
import { dedupe } from './merge'
import {
  emptyDraft,
  loadAll,
  mergeIntoLocal,
  renamePerson,
  saveTrip,
  tripToDraft,
  updateVehicleType,
  updateVehicleUnit,
} from './repo'
import type { CityTrip, Dataset } from './types'

let d: TripsDb
let n = 0
beforeEach(async () => {
  d = new TripsDb(`test-${n++}`)
  await d.open()
})

const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted)

describe('saveTrip', () => {
  it('reuses vehicles per mode and subtype and never mixes modes', async () => {
    const city = { ...emptyDraft('city'), transitType: 'tram' as const, manufacturer: 'Ganz', model: 'CSMG', licence: '1301' }
    const t1 = await saveTrip(city, d)
    const t2 = await saveTrip({ ...city, licence: '1301 ' }, d)
    await saveTrip({ ...city, transitType: 'bus' }, d)
    await saveTrip({ ...emptyDraft('car'), manufacturer: 'ganz', model: 'csmg', licence: '1301' }, d)
    const ds = await loadAll(d)
    expect(ds.vehicleTypes.map((t) => `${t.mode}/${t.subtype}`).sort()).toEqual(['car/', 'city/bus', 'city/tram'])
    expect(ds.vehicleUnits).toHaveLength(3)
    expect(t1.vehicleUnitId).toBe(t2.vehicleUnitId)
  })

  it('adds the driver of a personal car to the companions', async () => {
    const t = await saveTrip(
      { ...emptyDraft('car'), carType: 'personal', driver: 'Anna', companions: ['Béla', 'anna '] },
      d,
    )
    const ds = await loadAll(d)
    expect(ds.people.map((p) => p.name).sort()).toEqual(['Anna', 'Béla'])
    expect(t.mode === 'car' && t.driverId).toBe(t.companionIds[0])
    expect(t.companionIds).toHaveLength(2)
    expect(tripToDraft(t, ds).companions).toEqual(['Béla'])
  })

  it('calculates duration unless entered manually', async () => {
    const base = { ...emptyDraft('city'), departureTime: '23:50', arrivalTime: '00:20' }
    expect((await saveTrip(base, d)).durationMin).toBe(30)
    expect((await saveTrip({ ...base, durationMin: 45, durationManual: true }, d)).durationMin).toBe(45)
  })
})

describe('bus body types', () => {
  it('treat standard and articulated versions as separate types, only for buses and trolleybuses', async () => {
    const bus = { ...emptyDraft('city'), transitType: 'bus' as const, manufacturer: 'Mercedes', model: 'Citaro' }
    await saveTrip({ ...bus, bodyType: 'standard' }, d)
    await saveTrip({ ...bus, bodyType: 'articulated' }, d)
    await saveTrip({ ...bus, bodyType: 'Double decker' }, d)
    await saveTrip({ ...bus, transitType: 'tram', bodyType: 'articulated' }, d)
    await saveTrip({ ...bus, transitType: 'trolleybus', bodyType: 'articulated' }, d)
    const types = (await loadAll(d)).vehicleTypes
    expect(types.map((t) => t.bodyType).sort()).toEqual(['', 'Double decker', 'articulated', 'articulated', 'standard'])
  })
})

describe('HÉV details', () => {
  it('keeps carriage and seat colour only for commuter trips', async () => {
    const hev = { ...emptyDraft('city'), transitType: 'commuter' as const, carriage: '2', seatColor: 'mav' }
    const a = await saveTrip(hev, d)
    const b = await saveTrip({ ...hev, transitType: 'bus' }, d)
    expect(a).toMatchObject({ carriage: '2', seatColor: 'mav' })
    expect(b).toMatchObject({ carriage: '', seatColor: '' })
  })
  it('lists seat colours and carriages per reg. number', async () => {
    const hev = { ...emptyDraft('city'), transitType: 'commuter' as const, manufacturer: 'MÁV', model: 'MIX', licence: '912' }
    await saveTrip({ ...hev, seatColor: 'brown', carriage: '1' }, d)
    await saveTrip({ ...hev, seatColor: 'brown', carriage: '2' }, d)
    await saveTrip({ ...hev, seatColor: 'zöld' }, d)
    const unit = vehicleStats(await loadAll(d))[0].units[0]
    expect(unit.seatColors.map((a) => [a.label, a.count])).toEqual([['brown', 2], ['zöld', 1]])
    expect(unit.carriages.map((a) => a.label).sort()).toEqual(['1', '2'])
  })
})

describe('renames merge duplicates', () => {
  it('merges vehicle types and relinks trips', async () => {
    const a = await saveTrip({ ...emptyDraft('city'), manufacturer: 'Ikarus', model: '280', licence: 'ABC-123' }, d)
    const b = await saveTrip({ ...emptyDraft('city'), manufacturer: 'Ikarsu', model: '280', licence: 'ABC123' }, d)
    const ds = await loadAll(d)
    const typo = ds.vehicleTypes.find((t) => t.manufacturer === 'Ikarsu')!
    await updateVehicleType(typo.id, 'Ikarus', '280', '', d)
    const after = await loadAll(d)
    expect(live(after.vehicleTypes)).toHaveLength(1)
    expect(live(after.vehicleUnits)).toHaveLength(1)
    const ids = after.trips.filter((t) => t.id === a.id || t.id === b.id).map((t) => t.vehicleUnitId)
    expect(new Set(ids).size).toBe(1)
  })

  it('moves a licence to another type', async () => {
    await saveTrip({ ...emptyDraft('city'), manufacturer: 'Solaris', model: 'Urbino', licence: 'X1' }, d)
    await saveTrip({ ...emptyDraft('city'), manufacturer: 'Mercedes', model: 'Citaro', licence: 'Y1' }, d)
    const ds = await loadAll(d)
    const sol = ds.vehicleTypes.find((t) => t.manufacturer === 'Solaris')!
    const y1 = ds.vehicleUnits.find((u) => u.licence === 'Y1')!
    await updateVehicleUnit(y1.id, { vehicleTypeId: sol.id }, d)
    const after = await loadAll(d)
    expect(after.vehicleUnits.find((u) => u.id === y1.id)!.vehicleTypeId).toBe(sol.id)
  })

  it('merges people', async () => {
    await saveTrip({ ...emptyDraft('city'), companions: ['Kati', 'Katalin'] }, d)
    const ds = await loadAll(d)
    await renamePerson(ds.people.find((p) => p.name === 'Katalin')!.id, 'kati', d)
    const after = await loadAll(d)
    expect(live(after.people)).toHaveLength(1)
    expect(after.trips[0].companionIds).toHaveLength(1)
  })
})

describe('sync merge', () => {
  it('keeps the newest version, honours tombstones and dedupes offline duplicates', async () => {
    const local = await saveTrip({ ...emptyDraft('city'), line: '4', companions: ['Anna'] }, d)
    const remote: Dataset = {
      trips: [
        { ...(local as CityTrip), line: '6', updatedAt: local.updatedAt + 1000, companionIds: ['remote-anna'] },
        { ...local, id: 'gone', deleted: true, updatedAt: 1 },
      ],
      vehicleTypes: [],
      vehicleUnits: [],
      people: [{ id: 'remote-anna', name: 'Anna', createdAt: 0, updatedAt: 0 }],
    }
    await mergeIntoLocal(remote, d)
    const ds = await loadAll(d)
    const t = ds.trips.find((x) => x.id === local.id)!
    expect(t.mode === 'city' && t.line).toBe('6')
    expect(live(ds.people).map((p) => p.id)).toEqual(['remote-anna'])
    expect(t.companionIds).toEqual(['remote-anna'])
    expect(ds.trips.find((x) => x.id === 'gone')?.deleted).toBe(true)
  })

  it('dedupe is a no-op on clean data', async () => {
    await saveTrip({ ...emptyDraft('car'), driver: 'A', manufacturer: 'Skoda', model: 'Octavia' }, d)
    const { changed } = dedupe(await loadAll(d))
    expect(Object.values(changed).flat()).toHaveLength(0)
  })
})

describe('long-distance trips', () => {
  const draft = () => ({
    ...emptyDraft('long'),
    longType: 'train' as const,
    company: 'MÁV',
    lineType: 'InterCity',
    number: '560',
    from: 'Budapest-Keleti',
    to: 'Miskolc-Tiszai',
    distanceKm: 183,
    departureTime: '23:00',
    arrivalTime: '23:50',
    actualDeparture: '23:05',
    actualArrival: '00:10',
    manufacturer: 'Siemens',
    model: 'Taurus',
    licence: '470 001',
  })

  it('stores scheduled and actual durations and a signed delay', async () => {
    const t = await saveTrip(draft(), d)
    expect(t).toMatchObject({ mode: 'long', durationMin: 50, actualDurationMin: 65, delayMin: 20 })
    const early = await saveTrip({ ...draft(), actualArrival: '23:46' }, d)
    expect(early.mode === 'long' && early.delayMin).toBe(-4)
    const manual = await saveTrip({ ...draft(), actualDurationMin: 70, actualDurationManual: true }, d)
    expect(manual.mode === 'long' && manual.actualDurationMin).toBe(70)
  })

  it('keeps train and coach vehicles apart from each other and from city trips', async () => {
    await saveTrip(draft(), d)
    await saveTrip({ ...draft(), longType: 'coach' }, d)
    await saveTrip({ ...emptyDraft('city'), transitType: 'bus', manufacturer: 'Siemens', model: 'Taurus', licence: '470 001' }, d)
    const ds = await loadAll(d)
    expect(ds.vehicleTypes.map((t) => `${t.mode}/${t.subtype}`).sort()).toEqual(['city/bus', 'long/coach', 'long/train'])
  })

  it('round-trips through the edit draft', async () => {
    const t = await saveTrip(draft(), d)
    const ds = await loadAll(d)
    const back = tripToDraft(t, ds)
    expect(back).toMatchObject({ lineType: 'InterCity', number: '560', actualArrival: '00:10', licence: '470 001', distanceKm: 183 })
    const again = await saveTrip({ ...back, actualArrival: '23:50' }, d)
    expect(again.id).toBe(t.id)
    expect(again.mode === 'long' && again.delayMin).toBe(0)
  })

  it('is kept by JSON backup and exported to CSV', async () => {
    await saveTrip(draft(), d)
    const ds = await loadAll(d)
    expect(parseBackup(exportJson(ds)).trips).toHaveLength(1)
    const csv = exportCsv(ds)
    expect(csv.split('\n')[0]).toContain('actual_arrival')
    expect(csv).toContain('InterCity')
  })
})
