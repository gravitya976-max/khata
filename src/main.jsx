import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { getOtaBundle, isOTAActive } from './updater'

async function initApp() {
  if (isOTAActive()) {
    try {
      const bundle = await getOtaBundle()
      if (bundle && bundle.js) {
        if (bundle.css) {
          const styleEl = document.createElement('style')
          styleEl.id = 'ota-css'
          styleEl.textContent = bundle.css
          document.head.appendChild(styleEl)
        }

        const blob = new Blob([bundle.js], { type: 'application/javascript' })
        const scriptEl = document.createElement('script')
        scriptEl.type = 'module'
        scriptEl.src = URL.createObjectURL(blob)
        document.body.appendChild(scriptEl)
        return
      }
    } catch (err) {
      console.warn('OTA bundle load failed, falling back to local APK:', err)
    }
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

initApp()
