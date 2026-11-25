import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './i18n'
import './index.css'

if (!Capacitor.isNativePlatform()) registerSW({ immediate: true })
// Ask the browser not to evict IndexedDB under storage pressure.
void navigator.storage?.persist?.()

// On touch screens, scroll the focused field to the top so it and its suggestions stay above the keyboard.
if (matchMedia('(pointer: coarse)').matches) {
  document.addEventListener('focusin', (e) => {
    const el = e.target
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
    if (['checkbox', 'radio', 'date', 'time', 'file'].includes(el.type)) return
    setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
