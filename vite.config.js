import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Use '/' for Capacitor (APK) builds, '/khata/' for GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: process.env.BUILD_TARGET === 'web' ? '/khata/' : '/',
})
