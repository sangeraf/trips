import { create } from 'zustand'
import { onLocalChange } from '../db/db'
import { isConfigured, useSettings } from '../store/settings'
import { syncWithGitHub } from './sync'

export const useSyncState = create<{ running: boolean }>(() => ({ running: false }))

let pending = false

export async function syncNow(): Promise<void> {
  const { github, deviceName, setLastSync } = useSettings.getState()
  if (!isConfigured(github)) return
  if (useSyncState.getState().running) {
    pending = true
    return
  }
  useSyncState.setState({ running: true })
  try {
    const r = await syncWithGitHub(github, deviceName || navigator.userAgent.split(' ')[0])
    setLastSync({ at: Date.now(), ok: true, message: `↓${r.pulled} ↑${r.pushed}` })
  } catch (e) {
    setLastSync({ at: Date.now(), ok: false, message: e instanceof Error ? e.message : String(e) })
  } finally {
    useSyncState.setState({ running: false })
  }
  if (pending) {
    pending = false
    void syncNow()
  }
}

/** Syncs on start, when the device comes online or the app is reopened, and shortly after local edits. */
export function startAutoSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const maybe = () => {
    if (useSettings.getState().autoSync && navigator.onLine) void syncNow()
  }
  const debounced = () => {
    clearTimeout(timer)
    timer = setTimeout(maybe, 3000)
  }
  const onVisible = () => document.visibilityState === 'visible' && maybe()
  window.addEventListener('online', maybe)
  document.addEventListener('visibilitychange', onVisible)
  const off = onLocalChange(debounced)
  maybe()
  return () => {
    clearTimeout(timer)
    window.removeEventListener('online', maybe)
    document.removeEventListener('visibilitychange', onVisible)
    off()
  }
}
