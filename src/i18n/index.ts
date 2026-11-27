import { avgMin, type Agg } from '../lib/stats'
import i18n from 'i18next'
import { useMemo } from 'react'
import { initReactI18next, useTranslation } from 'react-i18next'
import { BUS_BODY_TYPES, SEAT_COLORS, type Mode, type Trip } from '../db/types'
import { clean, normalize } from '../lib/text'
import { useSettings } from '../store/settings'
import en from './en'
import hu from './hu'

const resources = { en: { translation: en }, hu: { translation: hu } }

void i18n.use(initReactI18next).init({
  resources,
  lng: useSettings.getState().lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

const applyLang = (lang: string) => {
  if (i18n.language !== lang) void i18n.changeLanguage(lang)
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}
applyLang(useSettings.getState().lang)
useSettings.subscribe((s) => applyLang(s.lang))

export default i18n

/** Built-in body types are stored as keys so they show translated; custom ones are kept as typed. */
export function bodyTypeLabel(stored: string): string {
  return BUS_BODY_TYPES.includes(stored) ? i18n.t(`bodyType.${stored}`) : stored
}

export function bodyTypeFromText(text: string): string {
  const n = normalize(text)
  const builtIn = BUS_BODY_TYPES.find(
    (k) => n === k || n === normalize(en.bodyType[k as keyof typeof en.bodyType]) || n === normalize(hu.bodyType[k as keyof typeof hu.bodyType]),
  )
  return builtIn ?? clean(text)
}

/** HÉV seat colours: built-in keys show translated, custom values as typed. */
export function seatColorLabel(stored: string): string {
  return SEAT_COLORS.includes(stored) ? i18n.t(`seatColor.${stored}`) : stored
}

export function seatColorFromText(text: string): string {
  const n = normalize(text)
  const builtIn = SEAT_COLORS.find(
    (k) => n === k || n === normalize(en.seatColor[k as keyof typeof en.seatColor]) || n === normalize(hu.seatColor[k as keyof typeof hu.seatColor]),
  )
  return builtIn ?? clean(text)
}

/** Numeric HÉV carriages read as "2. kocsi" / "Carriage 2"; custom values as typed. */
export function subtypeLabel(mode: Mode, sub: string, short = false): string {
  const group = mode === 'car' ? 'carType' : mode === 'city' ? (short ? 'cityTypeShort' : 'cityType') : short ? 'longTypeShort' : 'longType'
  return i18n.t(`${group}.${sub}`)
}

/** A line as shown in rankings: "Villamos 4 · Budapest", "InterCity 560 · MÁV". */
export function lineLabel(t: Trip, tr: (key: string) => string = (k) => i18n.t(k)): string {
  if (t.mode === 'city') return `${tr(`cityTypeShort.${t.transitType}`)} ${t.line}${t.city ? ` · ${t.city}` : ''}`
  if (t.mode === 'long') return [t.company, t.lineType, t.lineName].filter(Boolean).join(' ')
  return ''
}

export function carriageLabel(stored: string): string {
  return /^\d+$/.test(stored) ? i18n.t('carriageN', { n: stored }) : stored
}

/** "2", "2. kocsi", "Carriage 2" → "2"; anything else is kept as typed. */
export function carriageFromText(text: string): string {
  const m = normalize(text).match(/^(?:carriage|kocsi)?\s*(\d+)\.?\s*(?:kocsi)?$/)
  return m ? String(Number(m[1])) : clean(text)
}

export function useFormat() {
  const { t, i18n: inst } = useTranslation()
  const locale = inst.language === 'hu' ? 'hu-HU' : 'en-GB'
  return useMemo(
    () => ({
      hours(min: number) {
        const h = Math.floor(min / 60)
        const m = Math.round(min % 60)
        const hu = inst.language === 'hu'
        if (!h) return hu ? `${m} p` : `${m} min`
        return hu ? `${h} ó ${m} p` : `${h} h ${m} min`
      },
      avg: (min: number) => {
        const n = min.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        return inst.language === 'hu' ? `Ø ${n} p` : `Ø ${n} min`
      },
      /** Signed delay, e.g. "+12 min", "−3 min", "±0 min". */
      delay: (min: number) => {
        const n = Math.abs(min).toLocaleString(locale, { maximumFractionDigits: 1 })
        return `${min > 0 ? '+' : min < 0 ? '−' : '±'}${n} ${inst.language === 'hu' ? 'p' : 'min'}`
      },
      /** "3× · 1 h 5 min · Ø 21.7 min", plus distance when asked and known. */
      agg(a: Agg, withKm = false) {
        const avg = avgMin(a)
        return [`${a.count}×`, this.hours(a.minutes), avg == null ? '' : this.avg(avg), withKm && a.km > 0 ? this.km(a.km) : '']
          .filter(Boolean)
          .join(' · ')
      },
      km: (n: number) => `${n.toLocaleString(locale, { maximumFractionDigits: 1 })} km`,
      date: (iso: string) =>
        new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' }),
      month: (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString(locale, { month: 'short' }),
      /** Short weekday name, 0 = Monday. */
      weekday: (i: number) => new Date(2024, 0, 1 + i, 12).toLocaleDateString(locale, { weekday: 'short' }),
      dateTime: (ms: number) => new Date(ms).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }),
      t,
    }),
    [locale, inst.language, t],
  )
}
