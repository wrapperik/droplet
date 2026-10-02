import { useId } from 'react'
import './FolderIcon.css'

type Props = {
  className?: string
}

// A layered, glossy folder: dark back panel, a sheet of paper, and a translucent front panel.
// Colours come from the palette tokens, so the icon follows any palette change.
export default function FolderIcon({ className }: Props) {
  const id = useId()

  return (
    <svg className={`folder-icon ${className ?? ''}`} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-back`} x1="8" y1="8" x2="50" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="folder-icon__stop-back-top" />
          <stop offset="1" className="folder-icon__stop-back-bottom" />
        </linearGradient>
        <linearGradient id={`${id}-front`} x1="30" y1="20" x2="34" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="folder-icon__stop-front-top" />
          <stop offset="1" className="folder-icon__stop-front-bottom" />
        </linearGradient>
        <linearGradient id={`${id}-gloss`} x1="8" y1="20" x2="44" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'var(--white)' }} stopOpacity="0.28" />
          <stop offset="1" style={{ stopColor: 'var(--white)' }} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-paper`} x1="0" y1="15" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'var(--white)' }} />
          <stop offset="1" className="folder-icon__stop-paper-bottom" />
        </linearGradient>
      </defs>

      <path
        fill={`url(#${id}-back)`}
        d="M10 8H22C24 8 25 8.8 26.5 9.8L28 10.8C29 11.4 30 11.7 31 11.7H49A5 5 0 0 1 54 16.7V45A5 5 0 0 1 49 50H11A5 5 0 0 1 6 45V12A4 4 0 0 1 10 8Z"
      />
      <rect x="11" y="15" width="39" height="22" rx="2.5" fill={`url(#${id}-paper)`} />
      <path
        fill={`url(#${id}-front)`}
        d="M7.5 48.5L10.2 26.5C10.5 25 11.6 24.2 13 24.2H34C36 24.2 37 23.6 38.5 22.6L41 20.8C42 20 43 19.5 44.3 19.5H54.5C57 19.5 58.6 21.5 58.2 24L55 49C54.6 51 53 52 51 52H11C8.7 52 7.2 50.6 7.5 48.5Z"
      />
      <path
        fill={`url(#${id}-gloss)`}
        d="M7.5 48.5L10.2 26.5C10.5 25 11.6 24.2 13 24.2H34C36 24.2 37 23.6 38.5 22.6L41 20.8C42 20 43 19.5 44.3 19.5H54.5C57 19.5 58.6 21.5 58.2 24L55 49C54.6 51 53 52 51 52H11C8.7 52 7.2 50.6 7.5 48.5Z"
      />
    </svg>
  )
}
