import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarList, StatTiles, type RankBy } from '../components/BarList'
import { Card, Field, inputCls, Section, Segmented } from '../components/ui'
import { hasBodyType, type Dataset, type Mode } from '../db/types'
import { bodyTypeLabel, carriageLabel, seatColorLabel, useFormat } from '../i18n'
import { avgMin, byMonth, filterTrips, groupBy, lineKey, one, placeKeys, RANKS, routeKey, subtypeOf, summarize } from '../lib/stats'
import { normalize, todayIso } from '../lib/text'

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
  const [rank, setRank] = useState<RankBy>('count')
  const { from, to } = preset === 'custom' ? custom : presetRange(preset)

  const s = useMemo(() => {
    const trips = filterTrips(ds.trips, { from, to, mode })
    const city = trips.filter((x) => x.mode === 'city')
    const car = trips.filter((x) => x.mode === 'car')
    const unitType = new Map(ds.vehicleUnits.map((u) => [u.id, u.vehicleTypeId]))
    const types = new Map(ds.vehicleTypes.map((v) => [v.id, v]))
    return {
      bodyTypes: groupBy(city, (x) => {
        if (x.mode !== 'city' || !hasBodyType(x.transitType) || !x.vehicleUnitId) return null
        const vt = types.get(unitType.get(x.vehicleUnitId) ?? '')
        return vt?.bodyType
          ? one(`${x.transitType}|${normalize(vt.bodyType)}`, `${t(`cityTypeShort.${x.transitType}`)} · ${bodyTypeLabel(vt.bodyType)}`)
          : null
      }),
      carriages: groupBy(city, (x) =>
        x.mode === 'city' && x.transitType === 'commuter' && x.carriage ? one(normalize(x.carriage), carriageLabel(x.carriage)) : null,
      ),
      seatColors: groupBy(city, (x) =>
        x.mode === 'city' && x.transitType === 'commuter' && x.seatColor ? one(normalize(x.seatColor), seatColorLabel(x.seatColor)) : null,
      ),
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
        <Segmented
          value={rank}
          onChange={setRank}
          options={RANKS.map((r) => ({ value: r, label: t(`stats.rankBy.${r}`) }))}
        />
      </div>

      <StatTiles
        tiles={[
          { label: t('stats.trips'), value: String(s.total.count) },
          { label: t('stats.time'), value: f.hours(s.total.minutes) },
          { label: t('stats.avg'), value: avgMin(s.total) == null ? '—' : f.avg(avgMin(s.total)!) },
          { label: t('stats.distance'), value: f.km(s.total.km) },
        ]}
      />

      {!mode && (
        <Section title={t('stats.byMode')}>
          <BarList by={rank} items={s.modes} showKm />
        </Section>
      )}
      <Section title={t('stats.bySubtype')}>
        <BarList by={rank} items={s.subtypes} showKm />
      </Section>
      {mode !== 'car' && (
        <>
          <Section title={t('stats.topLines')}>
            <BarList by={rank} items={s.lines} />
          </Section>
          <Section title={t('stats.topCities')}>
            <BarList by={rank} items={s.cities} limit={5} />
          </Section>
          {s.bodyTypes.length > 0 && (
            <Section title={t('stats.bodyTypes')}>
              <BarList by={rank} items={s.bodyTypes} />
            </Section>
          )}
          {s.carriages.length > 0 && (
            <Section title={t('stats.carriages')}>
              <BarList by={rank} items={s.carriages} />
            </Section>
          )}
          {s.seatColors.length > 0 && (
            <Section title={t('stats.seatColors')}>
              <BarList by={rank} items={s.seatColors} />
            </Section>
          )}
        </>
      )}
      <Section title={t('stats.topRoutes')}>
        <BarList by={rank} items={s.routes} showKm />
      </Section>
      <Section title={t('stats.topPlaces')}>
        <BarList items={s.places} countOnly />
      </Section>
      {mode !== 'city' && s.companies.length > 0 && (
        <Section title={t('stats.taxiCompanies')}>
          <BarList by={rank} items={s.companies} showKm />
        </Section>
      )}
      <Section title={t('stats.perMonth')}>
        {s.months.length ? (
          <Card>
            <div className="flex h-40 items-end gap-1 overflow-x-auto">
              {s.months.map((m) => (
                <div key={m.key} className="flex min-w-[2rem] flex-1 flex-col items-center justify-end gap-1" title={f.agg(m)}>
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
