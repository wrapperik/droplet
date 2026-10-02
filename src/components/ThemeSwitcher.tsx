import { MonitorIcon, MoonIcon, SunIcon } from '@solar-icons/react/linear'
import type { Icon } from '@solar-icons/react/lib/types'
import type { ThemePreference } from '../lib/theme.ts'
import { useThemeStore } from '../store/theme.ts'
import './ThemeSwitcher.css'

const options: { value: ThemePreference; label: string; icon: Icon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
]

// Native radio inputs give arrow-key navigation and screen reader semantics for free.
export default function ThemeSwitcher() {
  const preference = useThemeStore((state) => state.preference)
  const setPreference = useThemeStore((state) => state.setPreference)

  return (
    <fieldset className="theme-switcher">
      <legend className="visually-hidden">Theme</legend>
      {options.map(({ value, label, icon: OptionIcon }) => (
        <label key={value} className="theme-switcher__option" title={label}>
          <input
            className="theme-switcher__input"
            type="radio"
            name="theme"
            value={value}
            checked={preference === value}
            onChange={() => setPreference(value)}
          />
          <OptionIcon size={18} aria-hidden="true" />
          <span className="theme-switcher__label">{label}</span>
        </label>
      ))}
    </fieldset>
  )
}
