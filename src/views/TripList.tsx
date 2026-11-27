import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Empty, inputCls } from '../components/ui'
import { CAR_TYPES, CITY_TYPES, LONG_TYPES, type Dataset, type Mode, type Trip } from '../db/types'
import { bodyTypeLabel, carriageLabel, seatColorLabel, subtypeLabel, useFormat } from '../i18n'
import { formatDuration } from '../lib/duration'
import { elapsedMin, subtypeOf } from '../lib/stats'
import { normalize } from '../lib/text'

const badgeColor: Record<string, string> = {
  metro: 'bg-blue-600',
  tram: 'bg-yellow-500',
  trolleybus: 'bg-red-600',
  bus: 'bg-sky-600',
  commuter: 'bg-green-700',
  taxi: 'bg-amber-500',
  personal: 'bg-slate-600',
  train: 'bg-indigo-700',
  coach: 'bg-orange-600',
}

export function TripBadge({ trip }: { trip: Trip }) {
  const sub = subtypeOf(trip)
  const label = subtypeLabel(trip.mode, sub, true)
  const tag = trip.mode === 'city' ? trip.line : trip.mode === 'long' ? trip.lineName || trip.lineType : ''
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-bold text-white ${badgeColor[sub]}`}>
      {label}
      {tag && <span className="rounded bg-white/25 px-1">{tag}</span>}
    </span>
  )
}

export function TripList({ ds, onOpen }: { ds: Dataset; onOpen: (t: Trip) => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [mode, setMode] = useState<Mode | ''>('')
  const [sub, setSub] = useState('')
  const [q, setQ] = useState('')

  const people = useMemo(() => new Map(ds.people.map((p) => [p.id, p.name])), [ds.people])
  const units = useMemo(() => new Map(ds.vehicleUnits.map((u) => [u.id, u])), [ds.vehicleUnits])
  const types = useMemo(() => new Map(ds.vehicleTypes.map((v) => [v.id, v])), [ds.vehicleTypes])

  const list = useMemo(() => {
    const nq = normalize(q)
    return ds.trips
      .filter((tr) => !tr.deleted && (!mode || tr.mode === mode) && (!sub || subtypeOf(tr) === sub))
      .filter((tr) => {
        if (!nq) return true
        const unit = tr.vehicleUnitId ? units.get(tr.vehicleUnitId) : undefined
        const type = unit ? types.get(unit.vehicleTypeId) : undefined
        const hay = [
          ...Object.values(tr).filter((v) => typeof v === 'string'),
          unit?.licence,
          type?.manufacturer,
          type?.model,
          ...tr.companionIds.map((id) => people.get(id)),
          tr.mode === 'city' ? carriageLabel(tr.carriage ?? '') : '',
          tr.mode === 'city' ? seatColorLabel(tr.seatColor ?? '') : '',
        ].join(' ')
        return normalize(hay).includes(nq)
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.departureTime.localeCompare(a.departureTime) || b.createdAt - a.createdAt)
  }, [ds.trips, mode, sub, q, units, types, people])

  const groups = useMemo(() => {
    const m = new Map<string, Trip[]>()
    for (const tr of list) m.set(tr.date, [...(m.get(tr.date) ?? []), tr])
    return [...m.entries()]
  }, [list])

  const subs = mode === 'car' ? CAR_TYPES : mode === 'city' ? CITY_TYPES : mode === 'long' ? LONG_TYPES : []
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select
          className={`${inputCls} w-auto`}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as Mode | '')
            setSub('')
          }}
        >
          <option value="">{t('common.allModes')}</option>
          <option value="city">{t('mode.city')}</option>
          <option value="car">{t('mode.car')}</option>
          <option value="long">{t('mode.long')}</option>
        </select>
        {subs.length > 0 && (
          <select className={`${inputCls} w-auto`} value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {subs.map((s) => (
              <option key={s} value={s}>
                {subtypeLabel(mode as Mode, s)}
              </option>
            ))}
          </select>
        )}
        <input className={inputCls} placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!list.length && <Empty>{t(ds.trips.some((x) => !x.deleted) ? 'list.noMatch' : 'list.empty')}</Empty>}
      {groups.map(([date, items]) => (
        <div key={date} className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-500">{f.date(date)}</h3>
          {items.map((tr) => {
            const [a, b] = tr.mode === 'car' ? [tr.startPlace, tr.endPlace] : [tr.from, tr.to]
            const unit = tr.vehicleUnitId ? units.get(tr.vehicleUnitId) : undefined
            const type = unit ? types.get(unit.vehicleTypeId) : undefined
            const driverId = tr.mode === 'car' && tr.carType === 'personal' ? tr.driverId : null
            const companions = tr.companionIds.filter((id) => id !== driverId).map((id) => people.get(id)).filter(Boolean)
            const times = [tr.departureTime, tr.arrivalTime].filter(Boolean).join('–')
            const actualTimes = tr.mode === 'long' ? [tr.actualDeparture, tr.actualArrival].filter(Boolean).join('–') : ''
            const extra =
              tr.mode === 'long'
                ? [
                    [tr.company, tr.lineName && tr.lineType, tr.number].filter(Boolean).join(' '),
                    actualTimes && `${t('field.actual')}: ${actualTimes}`,
                    tr.delayMin != null && `${t('field.delay')}: ${f.delay(tr.delayMin)}`,
                    tr.distanceKm ? f.km(tr.distanceKm) : '',
                  ]
                : tr.mode === 'car'
                ? [tr.carType === 'taxi' ? tr.company : tr.driverId && people.get(tr.driverId), tr.distanceKm ? f.km(tr.distanceKm) : '']
                : [
                    tr.city,
                    tr.carriage && carriageLabel(tr.carriage),
                    tr.seatColor && seatColorLabel(tr.seatColor),
                  ]
            return (
              <Card key={tr.id} onClick={() => onOpen(tr)}>
                <div className="flex items-start gap-2">
                  <TripBadge trip={tr} />
                  <span className="min-w-0 break-words font-medium">{a || b ? `${a || '?'} → ${b || '?'}` : '—'}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-slate-500">
                  {times && <span>{times}</span>}
                  {elapsedMin(tr) != null && <span>{formatDuration(elapsedMin(tr))}</span>}
                  {extra.filter(Boolean).map((x) => (
                    <span key={String(x)}>{x}</span>
                  ))}
                  {(type || unit?.licence) && (
                    <span>
                      {[type?.manufacturer, type?.model, type?.bodyType && bodyTypeLabel(type.bodyType), unit?.licence && `(${unit.licence})`]
                        .filter(Boolean)
                        .join(' ')}
                    </span>
                  )}
                  {companions.length > 0 && (
                    <span>
                      {t('field.companions')}: {companions.join(', ')}
                    </span>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      ))}
    </div>
  )
}
