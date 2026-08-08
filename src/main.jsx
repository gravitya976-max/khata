import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const HOSTED_URL = 'https://gravitya976-max.github.io/khata/'
const isOTA = localStorage.getItem('ota_active') === 'true'

if (isOTA && !window.location.href.startsWith(HOSTED_URL) && navigator.onLine) {
  window.location.href = HOSTED_URL
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
