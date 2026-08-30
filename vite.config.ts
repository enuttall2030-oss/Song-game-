/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
})
