import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GhConfig } from '../lib/github'

export type Lang = 'hu' | 'en'

export interface SyncStatus {
  at: number
  ok: boolean
  message: string
}

interface SettingsState {
  lang: Lang
  github: GhConfig
  autoSync: boolean
  deviceName: string
  lastSync: SyncStatus | null
  setLang: (lang: Lang) => void
  setGithub: (g: Partial<GhConfig>) => void
  setAutoSync: (v: boolean) => void
  setDeviceName: (v: string) => void
  setLastSync: (s: SyncStatus) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: 'hu',
      github: { owner: '', repo: '', branch: '', token: '' },
      autoSync: true,
      deviceName: '',
      lastSync: null,
      setLang: (lang) => set({ lang }),
      setGithub: (g) => set((s) => ({ github: { ...s.github, ...g } })),
      setAutoSync: (autoSync) => set({ autoSync }),
      setDeviceName: (deviceName) => set({ deviceName }),
      setLastSync: (lastSync) => set({ lastSync }),
    }),
    { name: 'trips-settings' },
  ),
)

export const isConfigured = (g: GhConfig) => !!(g.owner && g.repo && g.token)
