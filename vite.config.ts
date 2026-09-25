import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri prints its own output; keep Vite from wiping it.
  clearScreen: false,
  // Tauri expects the dev server on a fixed port (see src-tauri/tauri.conf.json build.devUrl).
  server: { port: 5173, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  // WKWebView on macOS 12; matches bundle.macOS.minimumSystemVersion.
  build: { target: 'safari13' },
})
