// The facts Droplet may propose about a business, and the founder may confirm. A fact is one short line in the founder's own words about the
// business, remembered for the project so every later chat knows it. Droplet only proposes: a fact is remembered when the founder says so.
//
// Kept free of anything from the interface, so the server function can use it too.

export const FACT_KEYS = [
  'profile.stage',
  'profile.what',
  'profile.who_for',
  'profile.where',
  'brand.values',
  'brand.voice',
  'brand.fonts',
  'logo.status',
  'business.name',
  'business.offer',
  'business.pricing',
  'preference.style',
] as const
export type FactKey = (typeof FACT_KEYS)[number]

export const MAX_FACT_LENGTH = 200

export const FACT_GROUPS = ['About the business', 'Brand', 'Preferences'] as const
export type FactGroup = (typeof FACT_GROUPS)[number]

export const FACT_INFO: Record<FactKey, { group: FactGroup; label: string; hint: string }> = {
  'profile.stage': { group: 'About the business', label: 'How far along it is', hint: 'Just an idea, selling to friends, already trading' },
  'profile.what': { group: 'About the business', label: 'What it does', hint: 'What the business makes or does' },
  'profile.who_for': { group: 'About the business', label: 'Who it is for', hint: 'The customers it is for' },
  'profile.where': { group: 'About the business', label: 'Where it is', hint: 'The town or area it works in' },
  'business.name': { group: 'About the business', label: 'The name', hint: 'The name of the business' },
  'business.offer': { group: 'About the business', label: 'What it offers', hint: 'The first offer, in a sentence' },
  'business.pricing': { group: 'About the business', label: 'How it prices', hint: 'How the founder charges' },
  'brand.values': { group: 'Brand', label: 'Brand values', hint: 'Three words for the feel' },
  'brand.voice': { group: 'Brand', label: 'How it sounds', hint: 'The tone it writes in' },
  'brand.fonts': { group: 'Brand', label: 'Fonts', hint: 'The fonts chosen' },
  'logo.status': { group: 'Brand', label: 'The logo', hint: 'That it exists, and where the files are' },
  'preference.style': { group: 'Preferences', label: 'How Droplet should write', hint: 'For example: short answers, no jargon' },
}

export const factLabel = (key: FactKey) => FACT_INFO[key].label

// Words that would put a private detail in a fact: an email address, a phone number, a long run of digits, a street address or a bank detail.
// Droplet is never sent an address, a contact or a bank detail (interviewees would not give an AI their client or financial details), and a fact is
// sent with every request, so none may be remembered as one.
const PRIVATE: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /(?:\+?\d[\s().-]?){9,}/,
  /\b\d{1,5}\s+(?:[A-Z][\w'-]*\s+){1,3}(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|crescent|close|way|boulevard|blvd|square|place|court|terrace|highway)\b/i,
  /\b(?:iban|swift|bic|branch code|account (?:number|no)|acc(?:ount)? no|sort code|routing number|pin)\b/i,
  /\b(?:my|our|the)\s+(?:address|phone|cell|mobile|email|e-mail)\s+(?:is|are)\b/i,
]

export const containsPrivateDetail = (text: string) => PRIVATE.some((pattern) => pattern.test(text))

// The words of a fact as they are kept: on one line, with the spaces tidied.
export const factText = (text: string) => text.replace(/\s+/g, ' ').trim()

// Whether words can be kept as a fact: there are some, not more than a fact holds, and no private detail in them.
export const factFits = (text: string) => {
  const words = factText(text)
  return words !== '' && words.length <= MAX_FACT_LENGTH && !containsPrivateDetail(words)
}
