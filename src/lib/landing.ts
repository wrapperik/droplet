import { STARTER_PALETTE } from '../compose/fallback.ts'
import { contrastLevel, contrastRatio, hexToRgb, type ContrastLevel } from './colour.ts'
import type { TaskId } from './tasks.ts'

// The words of the landing page (src/pages/Landing.tsx), kept as data so that a test can hold them to a short length and to the writing
// rules, and so that what the page promises is in one place to check. Every claim is one the app keeps. Anything added here must be one too.

export const HERO = {
  title: 'Software that takes the shape of the work.',
  lead: 'Droplet reads what a small business owner is trying to do and builds the workspace for it.',
  primary: 'Make an account',
  secondary: 'Sign in',
}

// Where the buttons go. The sign-in screen reads the mode from the address.
export const SIGN_IN_PATH = '/sign-in'
export const SIGN_UP_PATH = '/sign-in?mode=sign-up'

export const COMPARE = {
  title: 'Not a description. A tool you can use.',
  chat: {
    label: 'A chat reply',
    text: 'It names the colours and stops. You copy the codes somewhere else and hope the text is readable.',
  },
  droplet: {
    label: 'A Droplet workspace',
    text: 'It gives you the colours to adjust, with the contrast checked as you change them.',
  },
}

// What a chatbot says about the starter palette: the codes in a sentence. Built from the palette, so the two pictures show the same colours.
export function chatReply(): string {
  const [main, deep, pale, ink] = STARTER_PALETTE.map((colour) => colour.hex.toUpperCase())
  return `A calm blue such as ${main} pairs well with a deeper ${deep} and a soft ${pale}. Try ${ink} for the text.`
}

// The ratio of the starter palette's text on its background, worked out with the app's own contrast function. Never typed in.
export function starterContrast(): { ratio: number; level: ContrastLevel } {
  const hexOf = (role: string) => STARTER_PALETTE.find((colour) => colour.role === role)!.hex
  const ratio = contrastRatio(hexToRgb(hexOf('text')), hexToRgb(hexOf('background')))
  return { ratio, level: contrastLevel(ratio) }
}

export type DoesItem = { id: TaskId; title: string; text: string }

export const DOES = {
  title: 'What it does now',
  live: [
    { id: 'ideation', title: 'Shape the business idea', text: 'A board for notes, shapes and templates. Droplet adds notes when you ask.' },
    { id: 'brand', title: 'Build the brand', text: 'A colour palette with contrast checked live, shown on a real document.' },
    { id: 'invoice', title: 'Make an invoice', text: 'Totals and VAT worked out in code, and a PDF to share.' },
  ] satisfies DoesItem[],
  nextLabel: 'Next',
  next: [
    { id: 'logo', title: 'Get a logo' },
    { id: 'correspondence', title: 'Write to a client' },
  ] satisfies { id: TaskId; title: string }[],
}

export const TRUST = {
  title: 'You stay in charge.',
  points: [
    'Nothing is saved until you confirm.',
    'Sums and contrast are worked out in code, not by the AI.',
    'Addresses, contact details and bank details are never sent to the AI.',
    'You can delete your account and everything in it from the account page.',
  ],
}

export const NOT_YET = {
  title: 'Who it is not for yet',
  lead: 'Droplet says so up front, rather than letting you find out.',
  points: [
    'Teams. Droplet is for one founder at a time.',
    'Owners who already pay a designer and a bookkeeper.',
    'People who use screen readers or have limited fine motor control. It has not been tested with them yet.',
  ],
}

export const FOOTER = 'A student project by Rikus Pretorius, Open Window, 2026.'
