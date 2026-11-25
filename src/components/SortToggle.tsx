import { useTranslation } from 'react-i18next'
import type { SortBy } from '../lib/stats'
import { Segmented } from './ui'

export function SortToggle({ value, onChange }: { value: SortBy; onChange: (v: SortBy) => void }) {
  const { t } = useTranslation()
  return (
    <Segmented value={value} onChange={onChange} options={(['abc', 'count', 'time'] as SortBy[]).map((v) => ({ value: v, label: t(`vehicles.sort.${v}`) }))} />
  )
}
