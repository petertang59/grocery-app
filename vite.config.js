import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Honor the port assigned by the harness (autoPort) via the PORT env var,
    // falling back to Vite's default when run directly.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
