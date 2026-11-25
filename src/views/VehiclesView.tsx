import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarList, StatTiles } from '../components/BarList'
import { btnCls, btnDangerCls, btnGhostCls, Card, Empty, Field, inputCls, Section, Segmented } from '../components/ui'
import { deleteRecord, findTypeCollision, findUnitCollision, updateVehicleType, updateVehicleUnit } from '../db/repo'
import { CITY_TYPES, plateKind, type Dataset, type Mode } from '../db/types'
import { bodyTypeFromText, bodyTypeLabel, useFormat } from '../i18n'
import { vehicleStats, type TypeStats, type UnitStats } from '../lib/stats'

export function VehiclesView({ ds }: { ds: Dataset }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [mode, setMode] = useState<Mode>('city')
  const [openId, setOpenId] = useState<string | null>(null)
  const stats = useMemo(() => vehicleStats(ds), [ds])
  const open = stats.find((s) => s.type.id === openId)
  if (open) return <TypeDetail s={open} all={stats} ds={ds} onBack={() => setOpenId(null)} />

  const subtypes = mode === 'city' ? CITY_TYPES : ['']
  const ofMode = stats.filter((s) => s.type.mode === mode)
  return (
    <div className="space-y-4">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'city' as const, label: t('mode.city') },
          { value: 'car' as const, label: t('mode.car') },
        ]}
      />
      {!ofMode.length && <Empty>{t('vehicles.empty')}</Empty>}
      {subtypes.map((sub) => {
        const list = ofMode.filter((s) => s.type.subtype === sub)
        if (!list.length) return null
        return (
          <Section key={sub} title={sub ? t(`cityType.${sub}`) : t('mode.car')}>
            {list.map((s) => (
              <Card key={s.key} onClick={() => setOpenId(s.type.id)}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {s.label || t('vehicles.unknownType')}
                    {s.type.bodyType && <span className="ml-2 text-sm font-normal text-slate-500">{bodyTypeLabel(s.type.bodyType)}</span>}
                  </span>
                  <span className="text-sm text-slate-500">
                    {s.count}× · {f.hours(s.minutes)}
                    {s.km > 0 && ` · ${f.km(s.km)}`}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{t(`vehicles.${plateKind(s.type.mode, s.type.subtype)}Count`, { count: s.units.filter((u) => u.unit.licence).length })}</div>
              </Card>
            ))}
          </Section>
        )
      })}
    </div>
  )
}

function TypeDetail({ s, all, ds, onBack }: { s: TypeStats; all: TypeStats[]; ds: Dataset; onBack: () => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [manufacturer, setManufacturer] = useState(s.type.manufacturer)
  const [model, setModel] = useState(s.type.model)
  const [bodyText, setBodyText] = useState(bodyTypeLabel(s.type.bodyType))
  const isBus = s.type.subtype === 'bus'
  const bodyType = isBus ? bodyTypeFromText(bodyText) : ''
  const dirty = manufacturer !== s.type.manufacturer || model !== s.type.model || bodyType !== s.type.bodyType
  const kind = plateKind(s.type.mode, s.type.subtype)
  const save = async () => {
    const target = findTypeCollision(ds.vehicleTypes, s.type.id, manufacturer, model, bodyType)
    const name = [target?.manufacturer, target?.model, target?.bodyType && bodyTypeLabel(target.bodyType)].filter(Boolean).join(' ')
    if (target && !confirm(t('vehicles.confirmMerge', { name }))) return
    await updateVehicleType(s.type.id, manufacturer, model, bodyType)
    if (target) onBack()
  }
  const siblings = all.filter((o) => o.type.mode === s.type.mode && o.type.subtype === s.type.subtype && o.type.id !== s.type.id)

  return (
    <div className="space-y-4">
      <button className="text-teal-700 dark:text-teal-400" onClick={onBack}>
        ← {t('nav.vehicles')}
      </button>
      <h1 className="text-xl font-semibold">
        {s.label || t('vehicles.unknownType')}
        <span className="ml-2 text-sm font-normal text-slate-500">
          {[s.type.subtype ? t(`cityType.${s.type.subtype}`) : t('mode.car'), s.type.bodyType && bodyTypeLabel(s.type.bodyType)]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </h1>
      <StatTiles
        tiles={[
          { label: t('stats.trips'), value: String(s.count) },
          { label: t('stats.time'), value: f.hours(s.minutes) },
          s.type.mode === 'car'
            ? { label: t('stats.distance'), value: f.km(s.km) }
            : { label: t('vehicles.lines'), value: String(s.lines.length) },
        ]}
      />
      {s.first && (
        <p className="text-sm text-slate-500">
          {t('vehicles.used')}: {f.date(s.first)} – {f.date(s.last)}
        </p>
      )}

      <Section title={t('vehicles.editType')}>
        <p className="text-xs text-slate-500">{t('vehicles.editTypeHint')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('field.manufacturer')}>
            <input className={inputCls} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          </Field>
          <Field label={t('field.model')}>
            <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>
          {isBus && (
            <Field label={t('field.bodyType')}>
              <input className={inputCls} list="body-types" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
              <datalist id="body-types">
                {[...new Set(all.filter((o) => o.type.bodyType).map((o) => bodyTypeLabel(o.type.bodyType)).concat([t('bodyType.standard'), t('bodyType.articulated')]))].map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </Field>
          )}
        </div>
        <div className="flex gap-2">
          <button className={btnCls} disabled={!dirty} onClick={save}>
            {t('common.save')}
          </button>
          {s.count === 0 && (
            <button
              className={`${btnDangerCls} ml-auto`}
              onClick={async () => {
                await deleteRecord('vehicleTypes', s.type.id)
                onBack()
              }}
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </Section>

      <Section title={t(`vehicles.${kind}s`)}>
        {s.units.map((u) => (
          <UnitRow key={u.key} u={u} ds={ds} siblings={siblings} kind={kind} />
        ))}
      </Section>

      {s.type.mode === 'city' && s.lines.length > 0 && (
        <Section title={t('stats.topLines')}>
          <BarList items={s.lines} />
        </Section>
      )}
    </div>
  )
}

function UnitRow({ u, ds, siblings, kind }: { u: UnitStats; ds: Dataset; siblings: TypeStats[]; kind: 'licence' | 'reg' }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [editing, setEditing] = useState(false)
  const [licence, setLicence] = useState(u.unit.licence)
  const [typeId, setTypeId] = useState(u.unit.vehicleTypeId)

  const save = async () => {
    const target = findUnitCollision(ds.vehicleUnits, u.unit.id, typeId, licence)
    if (target && !confirm(t('vehicles.confirmMergeLicence', { name: target.licence || t(`vehicles.no${kind === 'reg' ? 'Reg' : 'Licence'}`) }))) return
    await updateVehicleUnit(u.unit.id, { licence, vehicleTypeId: typeId })
    setEditing(false)
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2" onClick={() => setEditing(!editing)}>
        <span className="font-mono font-medium">{u.unit.licence || t(`vehicles.no${kind === 'reg' ? 'Reg' : 'Licence'}`)}</span>
        <span className="text-sm text-slate-500">
          {u.count}× · {f.hours(u.minutes)}
          {u.km > 0 && ` · ${f.km(u.km)}`}
        </span>
      </div>
      {u.first && (
        <div className="text-xs text-slate-500">
          {f.date(u.first)} – {f.date(u.last)}
        </div>
      )}
      {editing && (
        <div className="mt-3 space-y-2">
          <Field label={t(`field.${kind}`)}>
            <input className={inputCls} value={licence} onChange={(e) => setLicence(e.target.value)} />
          </Field>
          {siblings.length > 0 && (
            <Field label={t('vehicles.moveTo')}>
              <select className={inputCls} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value={u.unit.vehicleTypeId}>{t('vehicles.keepType')}</option>
                {siblings.map((o) => (
                  <option key={o.type.id} value={o.type.id}>
                    {[o.label || t('vehicles.unknownType'), o.type.bodyType && bodyTypeLabel(o.type.bodyType)].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="flex gap-2">
            <button className={btnCls} onClick={save}>
              {t('common.save')}
            </button>
            <button className={btnGhostCls} onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </button>
            {u.count === 0 && (
              <button className={`${btnDangerCls} ml-auto`} onClick={() => deleteRecord('vehicleUnits', u.unit.id)}>
                {t('common.delete')}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
