import { create } from 'zustand'
import {
  applyTheme,
  readStoredPreference,
  resolveTheme,
  storePreference,
  systemPrefersDark,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme.ts'

type ThemeState = {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
  refreshSystem: () => void
}

const initialPreference = readStoredPreference()

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  resolved: resolveTheme(initialPreference, systemPrefersDark()),

  setPreference: (preference) => {
    const resolved = resolveTheme(preference, systemPrefersDark())
    storePreference(preference)
    applyTheme(resolved)
    set({ preference, resolved })
  },

  // Called when the operating system theme changes. Only matters while the preference is "system".
  refreshSystem: () => {
    if (get().preference !== 'system') return
    const resolved = resolveTheme('system', systemPrefersDark())
    applyTheme(resolved)
    set({ resolved })
  },
}))

// Keep "system" in step with the operating system without a reload.
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    useThemeStore.getState().refreshSystem()
  })
}
