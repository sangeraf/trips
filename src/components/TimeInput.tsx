import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeTime } from '../lib/duration'
import { inputCls } from './ui'

/** The native time picker follows the browser locale, so Hungarian gets a 24-hour text field instead. */
export function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { i18n } = useTranslation()
  const [text, setText] = useState<string | null>(null)
  if (i18n.language !== 'hu') {
    return <input type="time" className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
  }
  const shown = text ?? value
  const invalid = shown.trim() !== '' && normalizeTime(shown) === null
  return (
    <input
      className={`${inputCls} ${invalid ? '!border-red-500' : ''}`}
      inputMode="numeric"
      placeholder="óó:pp"
      value={shown}
      onChange={(e) => {
        const v = e.target.value
        setText(v)
        onChange(v.trim() === '' ? '' : (normalizeTime(v) ?? v))
      }}
      onBlur={() => setText(null)}
    />
  )
}
