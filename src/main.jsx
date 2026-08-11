import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { getOtaBundle, isOTAActive } from './updater'

let renderTimer = null
let cleanupOtaBoot = () => {}

async function initApp() {
  if (!window.__OTA_RUNNING__ && isOTAActive()) {
    let otaBooting = true
    let fallbackStarted = false
    let otaStyle = null

    const finishOtaBoot = () => {
      if (!otaBooting || fallbackStarted) return
      const rootEl = document.getElementById('root')
      if (!rootEl || !rootEl.hasChildNodes()) return

      otaBooting = false
      localStorage.setItem('ota_active', 'true')
      cleanupOtaBoot()
    }

    const fallbackToBase = (reason) => {
      if (fallbackStarted) return
      fallbackStarted = true
      otaBooting = false
      console.warn(`OTA boot failed: ${reason}. Falling back to the built-in app.`)
      localStorage.removeItem('ota_active')
      localStorage.removeItem('ota_version')
      window.__OTA_RUNNING__ = false
      otaStyle?.remove()
      renderBase()
    }

    const onOtaError = (event) => {
      if (!otaBooting) return
      fallbackToBase(event?.reason?.message || event?.message || 'runtime error')
    }

    cleanupOtaBoot = () => {
      if (renderTimer) {
        clearTimeout(renderTimer)
        renderTimer = null
      }
      window.removeEventListener('error', onOtaError)
      window.removeEventListener('unhandledrejection', onOtaError)
      cleanupOtaBoot = () => {}
    }

    try {
      window.__OTA_RUNNING__ = true

      // Older downloaded bundles do not know about __OTA_RUNNING__. While this
      // bundle is booting, use a non-"true" value so those bundles render once
      // instead of recursively loading themselves into a blank page.
      localStorage.setItem('ota_active', 'booting')
      window.addEventListener('error', onOtaError)
      window.addEventListener('unhandledrejection', onOtaError)

      // Safety timeout: a bad OTA bundle must never strand the user on a blank screen.
      renderTimer = setTimeout(() => {
        const rootEl = document.getElementById('root')
        if (!rootEl || !rootEl.hasChildNodes()) fallbackToBase('render timeout')
        else finishOtaBoot()
      }, 4000)

      const bundle = await getOtaBundle()
      if (bundle && bundle.js) {
        if (bundle.css) {
          otaStyle = document.createElement('style')
          otaStyle.id = 'ota-css'
          otaStyle.textContent = bundle.css
          document.head.appendChild(otaStyle)
        }

        const blob = new Blob([bundle.js], { type: 'application/javascript' })
        const scriptEl = document.createElement('script')
        scriptEl.type = 'module'
        scriptEl.src = URL.createObjectURL(blob)
        scriptEl.onerror = () => {
          fallbackToBase('script load error')
        }
        document.body.appendChild(scriptEl)
        return
      }
      fallbackToBase('cached bundle is missing')
    } catch (err) {
      fallbackToBase(err?.message || 'bundle load error')
    }
  }

  renderBase()
}

function renderBase() {
  cleanupOtaBoot()

  const rootEl = document.getElementById('root')
  if (rootEl) {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  }
}

initApp()
