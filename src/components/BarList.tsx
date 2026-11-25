import { useTranslation } from 'react-i18next'
import type { Agg } from '../lib/stats'
import { useFormat } from '../i18n'
import { Card } from './ui'

/** Ranked list with a proportional bar, used for most-used lines, places, people and so on. */
export function BarList({ items, limit = 10, showKm, onClick }: { items: Agg[]; limit?: number; showKm?: boolean; onClick?: (a: Agg) => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const top = items.slice(0, limit)
  const max = Math.max(1, ...top.map((a) => a.count))
  if (!top.length) return <p className="text-sm text-slate-500">{t('stats.none')}</p>
  return (
    <Card className="space-y-2">
      {top.map((a) => (
        <div key={a.key} onClick={onClick && (() => onClick(a))} className={onClick ? 'cursor-pointer' : ''}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 break-words font-medium">{a.label || '—'}</span>
            <span className="shrink-0 text-slate-500">
              {a.count}× · {f.hours(a.minutes)}
              {showKm && a.km > 0 ? ` · ${f.km(a.km)}` : ''}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded bg-slate-100 dark:bg-slate-700">
            <div className="h-1.5 rounded bg-teal-600" style={{ width: `${(a.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </Card>
  )
}

export function StatTiles({ tiles }: { tiles: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((x) => (
        <Card key={x.label} className="text-center">
          <div className="text-lg font-semibold">{x.value}</div>
          <div className="text-xs text-slate-500">{x.label}</div>
        </Card>
      ))}
    </div>
  )
}
