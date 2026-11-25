import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarList, StatTiles } from '../components/BarList'
import { Card, Field, inputCls, Section, Segmented } from '../components/ui'
import type { Dataset, Mode } from '../db/types'
import { bodyTypeLabel, useFormat } from '../i18n'
import { byMonth, filterTrips, groupBy, lineKey, one, placeKeys, routeKey, subtypeOf, summarize } from '../lib/stats'
import { todayIso } from '../lib/text'

type Preset = 'all' | 'year' | 'month' | 'd30' | 'custom'

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date()
  const today = todayIso(now)
  if (p === 'year') return { from: `${now.getFullYear()}-01-01`, to: today }
  if (p === 'month') return { from: today.slice(0, 8) + '01', to: today }
  if (p === 'd30') return { from: todayIso(new Date(now.getTime() - 29 * 86400000)), to: today }
  return { from: '', to: '' }
}

export function StatsView({ ds }: { ds: Dataset }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [preset, setPreset] = useState<Preset>('all')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [mode, setMode] = useState<Mode | ''>('')
  const { from, to } = preset === 'custom' ? custom : presetRange(preset)

  const s = useMemo(() => {
    const trips = filterTrips(ds.trips, { from, to, mode })
    const city = trips.filter((x) => x.mode === 'city')
    const car = trips.filter((x) => x.mode === 'car')
    const unitType = new Map(ds.vehicleUnits.map((u) => [u.id, u.vehicleTypeId]))
    const types = new Map(ds.vehicleTypes.map((v) => [v.id, v]))
    return {
      bodyTypes: groupBy(city, (x) => {
        const vt = x.mode === 'city' && x.transitType === 'bus' && x.vehicleUnitId ? types.get(unitType.get(x.vehicleUnitId) ?? '') : undefined
        return vt?.bodyType ? one(vt.bodyType, bodyTypeLabel(vt.bodyType)) : null
      }),
      total: summarize(trips),
      modes: groupBy(trips, (x) => one(x.mode, t(`mode.${x.mode}`))),
      subtypes: groupBy(trips, (x) =>
        one(`${x.mode}|${subtypeOf(x)}`, t(x.mode === 'car' ? `carType.${subtypeOf(x)}` : `cityType.${subtypeOf(x)}`)),
      ),
      lines: groupBy(city, (x) => {
        const k = lineKey(x)
        return k && x.mode === 'city' ? one(k[0].key, `${t(`cityTypeShort.${x.transitType}`)} ${x.line}${x.city ? ` · ${x.city}` : ''}`) : null
      }),
      cities: groupBy(city, (x) => (x.city ? one(x.city.toLowerCase(), x.city) : null)),
      routes: groupBy(trips, routeKey),
      places: groupBy(trips, placeKeys),
      companies: groupBy(car, (x) =>
        x.mode === 'car' && x.carType === 'taxi' && x.company ? one(x.company.toLowerCase(), x.company) : null,
      ),
      months: byMonth(trips),
    }
  }, [ds.trips, ds.vehicleUnits, ds.vehicleTypes, from, to, mode, t])

  const maxMonth = Math.max(1, ...s.months.map((m) => m.count))
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Segmented
          value={preset}
          onChange={setPreset}
          options={(['all', 'year', 'month', 'd30', 'custom'] as Preset[]).map((p) => ({ value: p, label: t(`stats.preset.${p}`) }))}
        />
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('stats.from')}>
              <input type="date" className={inputCls} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            </Field>
            <Field label={t('stats.to')}>
              <input type="date" className={inputCls} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </Field>
          </div>
        )}
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: '' as const, label: t('common.allModes') },
            { value: 'city' as const, label: t('mode.city') },
            { value: 'car' as const, label: t('mode.car') },
          ]}
        />
      </div>

      <StatTiles
        tiles={[
          { label: t('stats.trips'), value: String(s.total.count) },
          { label: t('stats.time'), value: f.hours(s.total.minutes) },
          { label: t('stats.distance'), value: f.km(s.total.km) },
        ]}
      />

      {!mode && (
        <Section title={t('stats.byMode')}>
          <BarList items={s.modes} showKm />
        </Section>
      )}
      <Section title={t('stats.bySubtype')}>
        <BarList items={s.subtypes} showKm />
      </Section>
      {mode !== 'car' && (
        <>
          <Section title={t('stats.topLines')}>
            <BarList items={s.lines} />
          </Section>
          <Section title={t('stats.topCities')}>
            <BarList items={s.cities} limit={5} />
          </Section>
          {s.bodyTypes.length > 0 && (
            <Section title={t('stats.bodyTypes')}>
              <BarList items={s.bodyTypes} />
            </Section>
          )}
        </>
      )}
      <Section title={t('stats.topRoutes')}>
        <BarList items={s.routes} showKm />
      </Section>
      <Section title={t('stats.topPlaces')}>
        <BarList items={s.places} />
      </Section>
      {mode !== 'city' && s.companies.length > 0 && (
        <Section title={t('stats.taxiCompanies')}>
          <BarList items={s.companies} showKm />
        </Section>
      )}
      <Section title={t('stats.perMonth')}>
        {s.months.length ? (
          <Card>
            <div className="flex h-40 items-end gap-1 overflow-x-auto">
              {s.months.map((m) => (
                <div key={m.key} className="flex min-w-[2rem] flex-1 flex-col items-center justify-end gap-1" title={`${m.count}× · ${f.hours(m.minutes)}`}>
                  <span className="text-xs text-slate-500">{m.count}</span>
                  <div className="w-full rounded-t bg-teal-600" style={{ height: `${(m.count / maxMonth) * 100}px` }} />
                  <span className="text-[10px] text-slate-500">{f.month(m.key)}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <p className="text-sm text-slate-500">{t('stats.none')}</p>
        )}
      </Section>
    </div>
  )
}
