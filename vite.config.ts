/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pwaPlugin } from './pwa-plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  // Ścieżki względne — aplikacja działa też z podkatalogu (np. GitHub Pages) i offline.
  base: './',
  plugins: [react(), pwaPlugin()],
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
