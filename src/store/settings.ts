import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GhConfig } from '../lib/github'

export type Lang = 'hu' | 'en'
export type TextSize = 'sm' | 'md' | 'lg' | 'xl'
export const TEXT_SIZE_PX: Record<TextSize, number> = { sm: 14, md: 16, lg: 18, xl: 20 }

export interface SyncStatus {
  at: number
  ok: boolean
  message: string
}

interface SettingsState {
  lang: Lang
  textSize: TextSize
  github: GhConfig
  autoSync: boolean
  deviceName: string
  lastSync: SyncStatus | null
  setLang: (lang: Lang) => void
  setTextSize: (v: TextSize) => void
  setGithub: (g: Partial<GhConfig>) => void
  setAutoSync: (v: boolean) => void
  setDeviceName: (v: string) => void
  setLastSync: (s: SyncStatus) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: 'hu',
      textSize: 'md',
      github: { owner: '', repo: '', branch: '', token: '' },
      autoSync: true,
      deviceName: '',
      lastSync: null,
      setLang: (lang) => set({ lang }),
      setTextSize: (textSize) => set({ textSize }),
      setGithub: (g) => set((s) => ({ github: { ...s.github, ...g } })),
      setAutoSync: (autoSync) => set({ autoSync }),
      setDeviceName: (deviceName) => set({ deviceName }),
      setLastSync: (lastSync) => set({ lastSync }),
    }),
    { name: 'trips-settings' },
  ),
)

export const isConfigured = (g: GhConfig) => !!(g.owner && g.repo && g.token)
