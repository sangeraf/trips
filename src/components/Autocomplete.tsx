import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { filterOptions, type Option } from '../lib/suggest'
import { inputCls } from './ui'

interface Props<T> {
  value: string
  onChange: (v: string) => void
  options: Option<T>[]
  onPick?: (o: Option<T>) => void
  placeholder?: string
  inputMode?: 'text' | 'numeric'
  autoCapitalize?: string
  onEnter?: () => void
  /** Keeps the input empty after picking, for multi-selects. */
  clearOnPick?: boolean
  extra?: (query: string) => { label: string; onPick: () => void } | null
}

/** Text input that suggests previously used values as you type. */
export function Autocomplete<T>({
  value,
  onChange,
  options,
  onPick,
  placeholder,
  inputMode,
  autoCapitalize,
  onEnter,
  clearOnPick,
  extra,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const shown = useMemo(() => filterOptions(options, value), [options, value])
  const extraItem = extra?.(value) ?? null
  const items = [
    ...shown.map((o) => ({ key: `o:${o.value}:${o.label ?? ''}`, o })),
    ...(extraItem ? [{ key: 'extra', o: null }] : []),
  ]

  const pick = (i: number) => {
    const it = items[i]
    if (!it) return
    if (it.o) {
      onChange(clearOnPick ? '' : it.o.value)
      onPick?.(it.o)
    } else extraItem?.onPick()
    setOpen(false)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && items.length && (value || active > 0)) {
        e.preventDefault()
        pick(active)
      } else if (onEnter) {
        e.preventDefault()
        onEnter()
      }
    } else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
      />
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
        >
          {items.map((it, i) => (
            <li
              key={it.key}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(i)
              }}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 ${
                i === active ? 'bg-teal-50 dark:bg-slate-700' : ''
              }`}
            >
              {it.o ? (
                <>
                  <span className="truncate">
                    {it.o.value}
                    {it.o.label && <span className="ml-2 text-sm text-slate-500">{it.o.label}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{it.o.hint ?? `${it.o.count}×`}</span>
                </>
              ) : (
                <span className="text-teal-700 dark:text-teal-400">{extraItem?.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
