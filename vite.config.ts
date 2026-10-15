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
    environmentMatchGlobs: [
      ['server/**', 'node'],
      ['src/compose/**', 'node'],
      ['src/lib/money.test.ts', 'node'],
      ['src/lib/colour.test.ts', 'node'],
      ['src/lib/readability.test.ts', 'node'],
      ['src/lib/boardGeometry.test.ts', 'node'],
      ['src/lib/facts.test.ts', 'node'],
    ],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Claude Code worktrees under .claude/ hold other copies of the tests; only this checkout's are run.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
    // The tests run on this device alone, whatever is in .env: no sign-in, and nothing sent to Supabase.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
}))
