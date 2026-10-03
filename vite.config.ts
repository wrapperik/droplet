/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { composePlugin } from './server/composePlugin.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // All variables, not only VITE_ ones: the Gemini key is read by the dev server and never reaches the browser.
  plugins: [react(), composePlugin(loadEnv(mode, process.cwd(), ''))],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}))
