import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// ──── Bundled Fonts (only weights + subsets actually used) ────
// Inter: body text (latin only — English UI text)
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-800.css'

// Poppins: headings (latin + devanagari for Hindi support)
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/poppins/latin-800.css'
import '@fontsource/poppins/latin-900.css'
import '@fontsource/poppins/devanagari-600.css'
import '@fontsource/poppins/devanagari-700.css'
import '@fontsource/poppins/devanagari-800.css'
import '@fontsource/poppins/devanagari-900.css'

// JetBrains Mono: numbers (latin only — numbers are always latin)
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@fontsource/jetbrains-mono/latin-800.css'

// Font Awesome: only solid icons (no brands, no regular)
import '@fortawesome/fontawesome-free/css/fontawesome.css'
import '@fortawesome/fontawesome-free/css/solid.css'

import './index.css'
import App from './App'

// Register service worker for offline caching and auto-updates
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
