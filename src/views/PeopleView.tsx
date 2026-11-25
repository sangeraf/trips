import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StatTiles } from '../components/BarList'
import { btnCls, btnDangerCls, btnGhostCls, Card, Empty, Field, inputCls, Section } from '../components/ui'
import { deleteRecord, findPersonCollision, renamePerson } from '../db/repo'
import type { Dataset } from '../db/types'
import { useFormat } from '../i18n'
import { peopleStats, type PersonStats } from '../lib/stats'

export function PeopleView({ ds }: { ds: Dataset }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [openId, setOpenId] = useState<string | null>(null)
  const stats = useMemo(() => peopleStats(ds.trips, ds.people), [ds.trips, ds.people])
  const open = stats.find((s) => s.person.id === openId)

  if (open) return <PersonDetail s={open} ds={ds} onBack={() => setOpenId(null)} />
  if (!stats.length) return <Empty>{t('people.empty')}</Empty>
  return (
    <div className="space-y-2">
      {stats.map((s) => (
        <Card key={s.key} onClick={() => setOpenId(s.person.id)}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{s.person.name}</span>
            <span className="text-sm text-slate-500">
              {s.count}× · {f.hours(s.minutes)}
            </span>
          </div>
          <div className="mt-1 flex gap-3 text-xs text-slate-500">
            <span>
              {t('mode.city')}: {s.perMode.city}
            </span>
            <span>
              {t('mode.car')}: {s.perMode.car}
            </span>
            {s.driven > 0 && <span>{t('people.drove', { count: s.driven })}</span>}
          </div>
        </Card>
      ))}
    </div>
  )
}

function PersonDetail({ s, ds, onBack }: { s: PersonStats; ds: Dataset; onBack: () => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [name, setName] = useState(s.person.name)
  const save = async () => {
    const target = findPersonCollision(ds.people, s.person.id, name)
    if (target && !confirm(t('people.confirmMerge', { name: target.name }))) return
    await renamePerson(s.person.id, name)
    if (target) onBack()
  }
  return (
    <div className="space-y-4">
      <button className="text-teal-700 dark:text-teal-400" onClick={onBack}>
        ← {t('nav.people')}
      </button>
      <h1 className="text-xl font-semibold">{s.person.name}</h1>
      <StatTiles
        tiles={[
          { label: t('stats.trips'), value: String(s.count) },
          { label: t('stats.time'), value: f.hours(s.minutes) },
          { label: t('people.driven'), value: String(s.driven) },
        ]}
      />
      <Section title={t('stats.byMode')}>
        <Card className="text-sm">
          {t('mode.city')}: {s.perMode.city} · {t('mode.car')}: {s.perMode.car}
          {s.first && <div className="mt-1 text-slate-500">{f.date(s.first)} – {f.date(s.last)}</div>}
        </Card>
      </Section>
      <Section title={t('common.edit')}>
        <Field label={t('people.name')}>
          <input className={inputCls} autoCapitalize="sentences" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <button className={btnCls} disabled={!name.trim() || name === s.person.name} onClick={save}>
            {t('common.save')}
          </button>
          <button className={btnGhostCls} onClick={onBack}>
            {t('common.cancel')}
          </button>
          {s.count === 0 && (
            <button
              className={`${btnDangerCls} ml-auto`}
              onClick={async () => {
                await deleteRecord('people', s.person.id)
                onBack()
              }}
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </Section>
    </div>
  )
}
