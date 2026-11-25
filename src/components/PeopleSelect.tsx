import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Option } from '../lib/suggest'
import { clean, normalize } from '../lib/text'
import { Autocomplete } from './Autocomplete'

interface Props {
  value: string[]
  onChange: (v: string[]) => void
  options: Option[]
  /** Shown as a fixed chip, e.g. the driver of a personal car. */
  locked?: string
}

/** Multi-select of people: pick saved people or add new names inline. */
export function PeopleSelect({ value, onChange, options, locked }: Props) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const taken = useMemo(() => new Set([...value, locked ?? ''].map(normalize)), [value, locked])
  const available = useMemo(() => options.filter((o) => !taken.has(normalize(o.value))), [options, taken])

  const add = (name: string) => {
    const n = clean(name)
    if (!n || taken.has(normalize(n))) return setQ('')
    const known = options.find((o) => normalize(o.value) === normalize(n))
    onChange([...value, known?.value ?? n])
    setQ('')
  }

  const lockedName = locked ? clean(locked) : ''
  return (
    <div className="space-y-2">
      {(value.length > 0 || lockedName) && (
        <div className="flex flex-wrap gap-2">
          {lockedName && (
            <span className="rounded-full bg-teal-700 px-3 py-1 text-sm text-white" title={t('form.driverLocked')}>
              {lockedName} · {t('form.driver')}
            </span>
          )}
          {value.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1 rounded-full bg-teal-100 py-1 pl-3 pr-1 text-sm text-teal-900 dark:bg-teal-900 dark:text-teal-100"
            >
              {name}
              <button
                type="button"
                aria-label={t('common.remove')}
                className="rounded-full px-2 text-teal-700 dark:text-teal-200"
                onClick={() => onChange(value.filter((v) => v !== name))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <Autocomplete
        value={q}
        onChange={setQ}
        options={available}
        clearOnPick
        onPick={(o) => add(o.value)}
        onEnter={() => add(q)}
        placeholder={t('form.addPerson')}
        autoCapitalize="sentences"
        extra={(query) =>
          clean(query) && !options.some((o) => normalize(o.value) === normalize(query))
            ? { label: t('form.addNew', { name: clean(query) }), onPick: () => add(query) }
            : null
        }
      />
    </div>
  )
}
