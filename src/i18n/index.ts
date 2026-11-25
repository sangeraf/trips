import { avgMin, type Agg } from '../lib/stats'
import i18n from 'i18next'
import { useMemo } from 'react'
import { initReactI18next, useTranslation } from 'react-i18next'
import { BUS_BODY_TYPES, SEAT_COLORS } from '../db/types'
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
      month: (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString(locale, { year: '2-digit', month: 'short' }),
      dateTime: (ms: number) => new Date(ms).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }),
      t,
    }),
    [locale, inst.language, t],
  )
}
