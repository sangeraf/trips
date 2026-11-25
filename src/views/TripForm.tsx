import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Autocomplete } from '../components/Autocomplete'
import { PeopleSelect } from '../components/PeopleSelect'
import { TimeInput } from '../components/TimeInput'
import { btnCls, btnDangerCls, btnGhostCls, Field, inputCls, Segmented } from '../components/ui'
import { alive, deleteTrip, saveTrip, type TripDraft } from '../db/repo'
import { BUS_BODY_TYPES, CAR_TYPES, HEV_CARRIAGES, SEAT_COLORS, hasBodyType, CITY_TYPES, plateKind, vehicleSubtype, type Dataset } from '../db/types'
import { bodyTypeFromText, bodyTypeLabel, carriageFromText, seatColorFromText, seatColorLabel } from '../i18n'
import { calcDuration, formatDuration, parseDuration, parseTime } from '../lib/duration'
import { peopleStats } from '../lib/stats'
import { cityOptions, companyOptions, lineOptions, placeOptions, type Option } from '../lib/suggest'
import { normalize } from '../lib/text'

interface Props {
  initial: TripDraft
  ds: Dataset
  onClose: () => void
  onCopy: (d: TripDraft) => void
}

type VehicleData = { manufacturer: string; model: string; bodyType: string }

function mergeOptions(entries: { value: string; count: number; label?: string; data?: VehicleData }[]) {
  const m = new Map<string, Option<VehicleData>>()
  for (const e of entries) {
    if (!e.value) continue
    const k = `${normalize(e.value)}|${e.label ?? ''}`
    const cur = m.get(k)
    if (cur) cur.count += e.count
    else m.set(k, { ...e })
  }
  return [...m.values()]
}

export function TripForm({ initial, ds, onClose, onCopy }: Props) {
  const { t } = useTranslation()
  const [d, setD] = useState<TripDraft>(initial)
  const [durationText, setDurationText] = useState(initial.durationManual ? formatDuration(initial.durationMin) : '')
  const [bodyText, setBodyText] = useState(bodyTypeLabel(initial.bodyType))
  const [seatText, setSeatText] = useState(seatColorLabel(initial.seatColor))
  const [carriageText, setCarriageText] = useState(initial.carriage)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof TripDraft>(k: K, v: TripDraft[K]) => setD((s) => ({ ...s, [k]: v }))

  // Opening the form must not pop up the keyboard: drop any focus the WebView gives a field without a tap.
  useEffect(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    let tapped = false
    const onDown = () => (tapped = true)
    const onFocus = (e: FocusEvent) => {
      if (!tapped) (e.target as HTMLElement).blur()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('focusin', onFocus, true)
    const stop = setTimeout(() => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('focusin', onFocus, true)
    }, 800)
    return () => {
      clearTimeout(stop)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('focusin', onFocus, true)
    }
  }, [])

  const trips = ds.trips
  const computed = calcDuration(d.departureTime, d.arrivalTime)
  const subtype = vehicleSubtype(d)

  const places = useMemo(() => placeOptions(trips, d.mode, d.city), [trips, d.mode, d.city])
  const cities = useMemo(() => cityOptions(trips, d.mode), [trips, d.mode])
  const lines = useMemo(() => lineOptions(trips, d.city, d.transitType), [trips, d.city, d.transitType])
  const companies = useMemo(() => companyOptions(trips, d.city), [trips, d.city])
  const people = useMemo(
    () => peopleStats(trips, ds.people).map((p) => ({ value: p.person.name, count: p.count })),
    [trips, ds.people],
  )

  const vehicle = useMemo(() => {
    const unitUse = new Map<string, number>()
    for (const tr of trips) if (!tr.deleted && tr.vehicleUnitId) unitUse.set(tr.vehicleUnitId, (unitUse.get(tr.vehicleUnitId) ?? 0) + 1)
    const types = ds.vehicleTypes.filter((vt) => alive(vt) && vt.mode === d.mode && vt.subtype === subtype)
    const units = ds.vehicleUnits.filter((u) => alive(u))
    const typeUse = (id: string) => units.filter((u) => u.vehicleTypeId === id).reduce((n, u) => n + (unitUse.get(u.id) ?? 0), 0)
    const mf = normalize(d.manufacturer)
    const md = normalize(d.model)
    const matching = types.filter((vt) => (!mf || normalize(vt.manufacturer) === mf) && (!md || normalize(vt.model) === md))
    return {
      manufacturers: mergeOptions(types.map((vt) => ({ value: vt.manufacturer, count: typeUse(vt.id) }))),
      models: mergeOptions(
        types.filter((vt) => !mf || normalize(vt.manufacturer) === mf).map((vt) => ({ value: vt.model, count: typeUse(vt.id) })),
      ),
      licences: mergeOptions(
        (matching.length ? matching : types).flatMap((vt) =>
          units
            .filter((u) => u.vehicleTypeId === vt.id && u.licence)
            .map((u) => ({
              value: u.licence,
              label: `${vt.manufacturer} ${vt.model}`.trim(),
              count: unitUse.get(u.id) ?? 0,
              data: { manufacturer: vt.manufacturer, model: vt.model, bodyType: vt.bodyType },
            })),
        ),
      ),
      bodyTypes: mergeOptions([
        ...BUS_BODY_TYPES.map((k) => ({ value: bodyTypeLabel(k), count: 0 })),
        ...types.filter((vt) => vt.bodyType).map((vt) => ({ value: bodyTypeLabel(vt.bodyType), count: typeUse(vt.id) })),
      ]),
    }
  }, [trips, ds.vehicleTypes, ds.vehicleUnits, d.mode, subtype, d.manufacturer, d.model])

  const onDuration = (text: string) => {
    setDurationText(text)
    const parsed = parseDuration(text)
    setD((s) => ({ ...s, durationManual: text.trim() !== '', durationMin: text.trim() ? parsed : null }))
  }

  const durationInvalid = d.durationManual && d.durationMin === null
  const timeInvalid = [d.departureTime, d.arrivalTime].some((v) => v !== '' && parseTime(v) === null)
  const hev = useMemo(() => {
    const used = trips.filter((x) => alive(x) && x.mode === 'city' && x.transitType === 'commuter')
    return {
      carriages: mergeOptions([
        ...HEV_CARRIAGES.map((v) => ({ value: v, count: 0 })),
        ...used.map((x) => ({ value: (x.mode === 'city' && x.carriage) || '', count: 1 })),
      ]),
      seatColors: mergeOptions([
        ...SEAT_COLORS.map((k) => ({ value: seatColorLabel(k), count: 0 })),
        ...used.map((x) => ({ value: x.mode === 'city' && x.seatColor ? seatColorLabel(x.seatColor) : '', count: 1 })),
      ]),
    }
  }, [trips])

  const submit = async () => {
    if (durationInvalid || timeInvalid) return
    setSaving(true)
    try {
      await saveTrip(d)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (d.id && confirm(t('form.confirmDelete'))) {
      await deleteTrip(d.id)
      onClose()
    }
  }

  const isTaxi = d.mode === 'car' && d.carType === 'taxi'
  const isPersonal = d.mode === 'car' && d.carType === 'personal'

  return (
    <form
      className="space-y-4 pb-24"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h1 className="text-xl font-semibold">
        {t(d.id ? 'form.editTitle' : 'form.newTitle', { mode: t(`mode.${d.mode}`) })}
      </h1>

      <Field label={t('field.date')}>
        <input type="date" required className={inputCls} value={d.date} onChange={(e) => set('date', e.target.value)} />
      </Field>

      {d.mode === 'car' ? (
        <Field label={t('field.carType')}>
          <Segmented
            value={d.carType}
            options={CAR_TYPES.map((v) => ({ value: v, label: t(`carType.${v}`) }))}
            onChange={(v) => set('carType', v)}
          />
        </Field>
      ) : (
        <Field label={t('field.transitType')}>
          <Segmented
            value={d.transitType}
            options={CITY_TYPES.map((v) => ({ value: v, label: t(`cityType.${v}`) }))}
            onChange={(v) => set('transitType', v)}
          />
        </Field>
      )}

      {(d.mode === 'city' || isTaxi) && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('field.city')} className={d.mode === 'city' ? '' : ''}>
            <Autocomplete value={d.city} onChange={(v) => set('city', v)} options={cities} autoCapitalize="sentences" />
          </Field>
          {d.mode === 'city' ? (
            <Field label={t('field.line')}>
              <Autocomplete value={d.line} onChange={(v) => set('line', v)} options={lines} />
            </Field>
          ) : (
            <Field label={t('field.company')}>
              <Autocomplete value={d.company} onChange={(v) => set('company', v)} options={companies} />
            </Field>
          )}
        </div>
      )}

      {d.mode === 'city' && d.transitType === 'commuter' && (
                  <div className="grid grid-cols-2 gap-3">
          <Field label={t('field.carriage')}>
            <Autocomplete
              value={carriageText}
              onChange={(v) => {
                setCarriageText(v)
                set('carriage', carriageFromText(v))
              }}
              options={hev.carriages}
            />
          </Field>
          <Field label={t('field.seatColor')}>
            <Autocomplete
              value={seatText}
              onChange={(v) => {
                setSeatText(v)
                set('seatColor', seatColorFromText(v))
              }}
              options={hev.seatColors}
            />
          </Field>
          </div>
      )}

      {isPersonal && (
        <Field label={t('form.driver')}>
          <Autocomplete value={d.driver} onChange={(v) => set('driver', v)} options={people} autoCapitalize="sentences" />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t(d.mode === 'car' ? 'field.startPlace' : 'field.from')}>
          <Autocomplete
            value={d.mode === 'car' ? d.startPlace : d.from}
            onChange={(v) => set(d.mode === 'car' ? 'startPlace' : 'from', v)}
            options={places}
            autoCapitalize="sentences"
          />
        </Field>
        <Field label={t(d.mode === 'car' ? 'field.endPlace' : 'field.to')}>
          <Autocomplete
            value={d.mode === 'car' ? d.endPlace : d.to}
            onChange={(v) => set(d.mode === 'car' ? 'endPlace' : 'to', v)}
            options={places}
            autoCapitalize="sentences"
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label={t('field.departure')}>
          <TimeInput value={d.departureTime} onChange={(v) => set('departureTime', v)} />
        </Field>
        <Field label={t('field.arrival')}>
          <TimeInput value={d.arrivalTime} onChange={(v) => set('arrivalTime', v)} />
        </Field>
        <Field label={t('field.duration')}>
          <input
            className={`${inputCls} ${durationInvalid ? '!border-red-500' : ''}`}
            inputMode="numeric"
            placeholder={computed !== null ? formatDuration(computed) : t('form.durationHint')}
            value={d.durationManual ? durationText : formatDuration(computed)}
            onChange={(e) => onDuration(e.target.value)}
          />
        </Field>
      </div>
      {d.durationManual && computed !== null && (
        <button type="button" className="text-sm text-teal-700 dark:text-teal-400" onClick={() => onDuration('')}>
          ↺ {t('form.useCalculated', { value: formatDuration(computed) })}
        </button>
      )}

      {d.mode === 'car' && (
        <Field label={t('field.distance')}>
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            className={inputCls}
            value={d.distanceKm ?? ''}
            onChange={(e) => set('distanceKm', e.target.value === '' ? null : Number(e.target.value))}
          />
        </Field>
      )}

      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <legend className="px-1 text-sm font-semibold text-slate-600 dark:text-slate-300">{t('field.vehicle')}</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('field.manufacturer')}>
            <Autocomplete value={d.manufacturer} onChange={(v) => set('manufacturer', v)} options={vehicle.manufacturers} />
          </Field>
          <Field label={t('field.model')}>
            <Autocomplete value={d.model} onChange={(v) => set('model', v)} options={vehicle.models} />
          </Field>
        </div>
        <div className={hasBodyType(subtype) ? 'grid grid-cols-2 gap-3' : ''}>
          {hasBodyType(subtype) && (
            <Field label={t('field.bodyType')}>
              <Autocomplete
                value={bodyText}
                onChange={(v) => {
                  setBodyText(v)
                  set('bodyType', bodyTypeFromText(v))
                }}
                options={vehicle.bodyTypes}
              />
            </Field>
          )}
          <Field label={t(`field.${plateKind(d.mode, subtype)}`)}>
            <Autocomplete
              value={d.licence}
              onChange={(v) => set('licence', v)}
              options={vehicle.licences}
              autoCapitalize="characters"
              onPick={(o) => {
                if (!o.data) return
                setD((s) => ({ ...s, licence: o.value, ...o.data }))
                setBodyText(bodyTypeLabel(o.data.bodyType))
              }}
            />
          </Field>
        </div>
      </fieldset>

      <Field label={t('field.companions')}>
        <PeopleSelect
          value={d.companions}
          onChange={(v) => set('companions', v)}
          options={people}
          locked={isPersonal ? d.driver : undefined}
        />
      </Field>

      <Field label={t('field.notes')}>
        <textarea className={inputCls} autoCapitalize="sentences" rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-2xl flex-wrap gap-2">
          <button type="button" className={btnGhostCls} onClick={onClose}>
            {t('common.cancel')}
          </button>
          {d.id && (
            <>
              <button type="button" className={btnDangerCls} onClick={remove}>
                {t('common.delete')}
              </button>
              <button type="button" className={btnGhostCls} onClick={() => onCopy(d)}>
                {t('form.copy')}
              </button>
            </>
          )}
          <button type="submit" className={`${btnCls} ml-auto`} disabled={saving || durationInvalid || timeInvalid}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </form>
  )
}
