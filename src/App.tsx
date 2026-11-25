import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { emptyDraft, tripToDraft, type TripDraft } from './db/repo'
import type { Mode } from './db/types'
import { startAutoSync, useSyncState } from './lib/autosync'
import { todayIso } from './lib/text'
import { useDataset } from './lib/useData'
import { isConfigured, useSettings } from './store/settings'
import { PeopleView } from './views/PeopleView'
import { SettingsView } from './views/SettingsView'
import { StatsView } from './views/StatsView'
import { TripForm } from './views/TripForm'
import { TripList } from './views/TripList'
import { VehiclesView } from './views/VehiclesView'

type Tab = 'trips' | 'stats' | 'vehicles' | 'people' | 'settings'
const TABS: Tab[] = ['trips', 'stats', 'vehicles', 'people', 'settings']

function SyncDot() {
  const running = useSyncState((s) => s.running)
  const { github, lastSync } = useSettings()
  if (!isConfigured(github)) return null
  const color = running ? 'bg-amber-400 animate-pulse' : !lastSync ? 'bg-slate-400' : lastSync.ok ? 'bg-teal-300' : 'bg-red-400'
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} title={lastSync?.message} />
}

export default function App() {
  const { t } = useTranslation()
  const ds = useDataset()
  const [tab, setTab] = useState<Tab>('trips')
  const [draft, setDraft] = useState<TripDraft | null>(null)
  const [chooser, setChooser] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const state = useRef({ tab, draft, chooser })
  useEffect(() => {
    state.current = { tab, draft, chooser }
  }, [tab, draft, chooser])

  useEffect(() => startAutoSync(), [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const sub = CapApp.addListener('backButton', () => {
      const s = state.current
      if (s.draft) setDraft(null)
      else if (s.chooser) setChooser(false)
      else if (s.tab !== 'trips') setTab('trips')
      else void CapApp.exitApp()
    })
    return () => void sub.then((h) => h.remove())
  }, [])

  const openNew = (mode: Mode) => {
    setChooser(false)
    setFormKey((k) => k + 1)
    setDraft(emptyDraft(mode))
    window.scrollTo(0, 0)
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-teal-700 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow">
        <span className="text-lg font-semibold">{draft ? t(draft.id ? 'app.editTrip' : 'app.newTrip') : t(`nav.${tab}`)}</span>
        <SyncDot />
      </header>

      <main className="p-4 pb-28">
        {!ds ? null : draft ? (
          <TripForm
            key={formKey}
            initial={draft}
            ds={ds}
            onClose={() => setDraft(null)}
            onCopy={(d) => {
              setFormKey((k) => k + 1)
              setDraft({ ...d, id: undefined, createdAt: undefined, date: todayIso() })
              window.scrollTo(0, 0)
            }}
          />
        ) : tab === 'trips' ? (
          <TripList
            ds={ds}
            onOpen={(tr) => {
              setFormKey((k) => k + 1)
              setDraft(tripToDraft(tr, ds))
              window.scrollTo(0, 0)
            }}
          />
        ) : tab === 'stats' ? (
          <StatsView ds={ds} />
        ) : tab === 'vehicles' ? (
          <VehiclesView ds={ds} />
        ) : tab === 'people' ? (
          <PeopleView ds={ds} />
        ) : (
          <SettingsView ds={ds} />
        )}
      </main>

      {!draft && tab === 'trips' && (
        <div className="fixed bottom-20 right-4 z-30 flex flex-col items-end gap-2 pb-[env(safe-area-inset-bottom)] sm:right-[calc(50%-20rem)]">
          {chooser && (
            <>
              <button className="rounded-full bg-white px-4 py-2 font-medium text-teal-800 shadow-lg dark:bg-slate-700 dark:text-white" onClick={() => openNew('city')}>
                {t('app.newCity')}
              </button>
              <button className="rounded-full bg-white px-4 py-2 font-medium text-teal-800 shadow-lg dark:bg-slate-700 dark:text-white" onClick={() => openNew('car')}>
                {t('app.newCar')}
              </button>
            </>
          )}
          <button
            aria-label={t('app.newTrip')}
            className={`h-14 w-14 rounded-full bg-teal-700 text-3xl text-white shadow-lg transition-transform active:bg-teal-800 ${chooser ? 'rotate-45' : ''}`}
            onClick={() => setChooser(!chooser)}
          >
            +
          </button>
        </div>
      )}

      {!draft && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-slate-800">
          <div className="mx-auto flex max-w-2xl">
            {TABS.map((x) => (
              <button
                key={x}
                onClick={() => {
                  setTab(x)
                  setChooser(false)
                }}
                className={`flex-1 py-3 text-xs font-medium ${tab === x ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500'}`}
              >
                {t(`nav.${x}`)}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
