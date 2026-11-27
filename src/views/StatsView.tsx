import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarList, StatTiles, type RankBy } from '../components/BarList'
import { Card, Field, inputCls, Section, Segmented } from '../components/ui'
import { hasBodyType, type Dataset, type Mode } from '../db/types'
import { bodyTypeLabel, carriageLabel, lineLabel, seatColorLabel, subtypeLabel, useFormat } from '../i18n'
import { avgMin, byMonth, delayStats, ON_TIME_MIN, filterTrips, groupBy, lineKey, one, placeKeys, rankValue, routeKey, STATS_RANKS, subtypeOf, summarize, type Agg } from '../lib/stats'
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
  const byDistance = rank === 'distance'

  const chooseRank = (r: RankBy) => {
    setRank(r)
    if (r === 'distance' && mode === 'city') setMode('')
  }

  const s = useMemo(() => {
    const all = filterTrips(ds.trips, { from, to, mode })
    const trips = byDistance ? all.filter((x) => x.mode !== 'city') : all
    const city = trips.filter((x) => x.mode === 'city')
    const car = trips.filter((x) => x.mode === 'car')
    const long = trips.filter((x) => x.mode === 'long')
    const unitType = new Map(ds.vehicleUnits.map((u) => [u.id, u.vehicleTypeId]))
    const types = new Map(ds.vehicleTypes.map((v) => [v.id, v]))
    const lines = (list: typeof trips) =>
      groupBy(list, (x) => {
        const k = lineKey(x)
        return k ? one(k[0].key, lineLabel(x, t)) : null
      })
    return {
      total: summarize(trips),
      months: byMonth(trips),
      modes: groupBy(trips, (x) => one(x.mode, t(`mode.${x.mode}`))),
      subtypes: groupBy(trips, (x) => one(`${x.mode}|${subtypeOf(x)}`, subtypeLabel(x.mode, subtypeOf(x)))),
      routes: groupBy(trips, routeKey),
      places: groupBy(trips, placeKeys),
      taxiCompanies: groupBy(car, (x) =>
        x.mode === 'car' && x.carType === 'taxi' && x.company ? one(x.company.toLowerCase(), x.company) : null,
      ),
      cities: groupBy(city, (x) => (x.mode === 'city' && x.city ? one(x.city.toLowerCase(), x.city) : null)),
      cityLines: lines(city),
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
      longCompanies: groupBy(long, (x) => (x.mode === 'long' && x.company ? one(normalize(x.company), x.company) : null)),
      lineTypes: groupBy(long, (x) =>
        x.mode === 'long' && x.lineType
          ? one(`${x.longType}|${normalize(x.company)}|${normalize(x.lineType)}`, [x.company, x.lineType].filter(Boolean).join(' '))
          : null,
      ),
      longLines: lines(long),
      delays: delayStats(long, (x) => lineLabel(x, t)),
    }
  }, [ds.trips, ds.vehicleUnits, ds.vehicleTypes, from, to, mode, byDistance, t])

  const monthValue = (m: Agg) =>
    rank === 'count'
      ? String(m.count)
      : rank === 'time'
        ? f.hours(m.minutes)
        : rank === 'distance'
          ? f.km(m.km)
          : avgMin(m) == null
            ? '—'
            : f.avg(avgMin(m)!)
  const maxMonth = Math.max(1, ...s.months.map((m) => rankValue(m, rank)))
  const ranked = (title: string, items: Agg[], opts: { showKm?: boolean; limit?: number; hideEmpty?: boolean } = {}) =>
    opts.hideEmpty && !items.length ? null : (
      <Section title={title}>
        <BarList by={rank} items={items} showKm={opts.showKm} limit={opts.limit} />
      </Section>
    )

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
            ...(byDistance ? [] : [{ value: 'city' as const, label: t('mode.city') }]),
            { value: 'car' as const, label: t('mode.car') },
            { value: 'long' as const, label: t('mode.long') },
          ]}
        />
        <Segmented value={rank} onChange={chooseRank} options={STATS_RANKS.map((r) => ({ value: r, label: t(`stats.rankBy.${r}`) }))} />
      </div>

      <StatTiles
        tiles={[
          { label: t('stats.trips'), value: String(s.total.count) },
          { label: t('stats.time'), value: f.hours(s.total.minutes) },
          { label: t('stats.avg'), value: avgMin(s.total) == null ? '—' : f.avg(avgMin(s.total)!) },
          ...(mode === 'city' ? [] : [{ label: t('stats.distance'), value: f.km(s.total.km) }]),
        ]}
      />

      <Section title={t('stats.perMonth')}>
        {s.months.length ? (
          <Card>
            <div className="flex h-40 items-end gap-1 overflow-x-auto">
              {s.months.map((m) => (
                <div key={m.key} className="flex min-w-[2.5rem] flex-1 flex-col items-center justify-end gap-1" title={f.agg(m, true)}>
                  <span className="whitespace-nowrap text-[10px] text-slate-500">{monthValue(m)}</span>
                  <div className="w-full rounded-t bg-teal-600" style={{ height: `${(rankValue(m, rank) / maxMonth) * 100}px` }} />
                  <span className="text-[10px] text-slate-500">{f.month(m.key)}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <p className="text-sm text-slate-500">{t('stats.none')}</p>
        )}
      </Section>

      {!mode && ranked(t('stats.byMode'), s.modes, { showKm: true })}

      {mode === 'car' && (
        <>
          {ranked(t('stats.bySubtype'), s.subtypes, { showKm: true })}
          {ranked(t('stats.taxiCompanies'), s.taxiCompanies, { showKm: true, hideEmpty: true })}
          {ranked(t('stats.topRoutes'), s.routes, { showKm: true })}
        </>
      )}

      {mode === 'city' && (
        <>
          {ranked(t('stats.topCities'), s.cities, { limit: 5 })}
          {ranked(t('stats.bySubtype'), s.subtypes)}
          {ranked(t('stats.topLines'), s.cityLines)}
          {ranked(t('stats.topRoutes'), s.routes)}
        </>
      )}

      {mode === 'long' && (
        <>
          {ranked(t('stats.bySubtype'), s.subtypes, { showKm: true })}
          {ranked(t('stats.companies'), s.longCompanies, { showKm: true })}
          {ranked(t('stats.lineTypes'), s.lineTypes, { showKm: true })}
          {ranked(t('stats.topLines'), s.longLines, { showKm: true })}
          {ranked(t('stats.topRoutes'), s.routes, { showKm: true })}
        </>
      )}

      {mode && (
        <Section title={t('stats.topPlaces')}>
          <BarList items={s.places} countOnly />
        </Section>
      )}

      {mode === 'city' && (
        <>
          {ranked(t('stats.bodyTypes'), s.bodyTypes, { hideEmpty: true })}
          {ranked(t('stats.carriages'), s.carriages, { hideEmpty: true })}
          {ranked(t('stats.seatColors'), s.seatColors, { hideEmpty: true })}
        </>
      )}

      {mode === 'long' && (
        <>
          <Section title={t('stats.delays')}>
            {s.delays.count > 0 ? (
              <StatTiles
                tiles={[
                  { label: t('stats.avgDelay'), value: f.delay(Math.round(s.delays.avg * 10) / 10) },
                  { label: t('stats.onTime', { n: ON_TIME_MIN }), value: `${Math.round((s.delays.onTime / s.delays.count) * 100)}%` },
                  { label: t('stats.maxDelay'), value: f.delay(s.delays.max) },
                ]}
              />
            ) : (
              <p className="text-sm text-slate-500">{t('stats.none')}</p>
            )}
          </Section>
          <Section title={t('stats.delayByLine')}>
            {s.delays.byLine.length > 0 ? (
              <div className="space-y-1">
                {s.delays.byLine.slice(0, 10).map((l) => (
                  <Card key={l.key} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words">{l.label}</span>
                    <span className="shrink-0 text-slate-500">
                      {l.count}× · Ø {f.delay(Math.round(l.avg * 10) / 10)}
                    </span>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t('stats.none')}</p>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
