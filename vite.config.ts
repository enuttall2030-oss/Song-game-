/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves this repo at /Song-game-/, not the domain root, so built asset URLs need
  // that prefix. Dev must stay at '/' — the Spotify redirect URI is pinned to 127.0.0.1:5173/ and
  // a base path here would silently stop matching it.
  base: command === 'build' ? '/Song-game-/' : '/',
  // Pinned: the Spotify redirect URI must match byte-for-byte, so silently falling back to
  // 127.0.0.1:5174 when the port is busy would break OAuth in a confusing way. Fail loudly instead.
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
  },
}))
