// The typefaces and voice words the brand guide offers. Fixed lists, chosen in code: the model never names a font. Every typeface is bundled with the app
// (`@fontsource-variable`, SIL Open Font License), so what is shown is what a founder can download and use.

export type FontPair = {
  id: string
  name: string
  // The names to type into Canva, Google Docs or a website builder.
  heading: string
  body: string
  headingStack: string
  bodyStack: string
  // Why this pair, in one line.
  note: string
}

export const FONT_PAIRS: FontPair[] = [
  { id: 'clean', name: 'Clean', heading: 'DM Sans', body: 'Inter', headingStack: "'DM Sans Variable', sans-serif", bodyStack: "'Inter Variable', sans-serif", note: 'Plain and modern. Works for almost any business.' },
  { id: 'editorial', name: 'Editorial', heading: 'Playfair Display', body: 'Inter', headingStack: "'Playfair Display Variable', serif", bodyStack: "'Inter Variable', sans-serif", note: 'An elegant serif for headings, a quiet sans for reading.' },
  { id: 'warm', name: 'Warm', heading: 'Fraunces', body: 'DM Sans', headingStack: "'Fraunces Variable', serif", bodyStack: "'DM Sans Variable', sans-serif", note: 'Soft, friendly curves that feel handmade.' },
  { id: 'tech', name: 'Technical', heading: 'Space Grotesk', body: 'Inter', headingStack: "'Space Grotesk Variable', sans-serif", bodyStack: "'Inter Variable', sans-serif", note: 'A little quirky and precise. Suits tools and studios.' },
  { id: 'story', name: 'Storyteller', heading: 'Lora', body: 'DM Sans', headingStack: "'Lora Variable', serif", bodyStack: "'DM Sans Variable', sans-serif", note: 'A readable serif that sounds personal and thoughtful.' },
  { id: 'premium', name: 'Premium', heading: 'Playfair Display', body: 'Lora', headingStack: "'Playfair Display Variable', serif", bodyStack: "'Lora Variable', serif", note: 'All serif. Signals quality and care.' },
]

export const fontPairById = (id: string | undefined | null): FontPair | undefined => FONT_PAIRS.find((pair) => pair.id === id)

export const VOICE_WORDS = ['Warm', 'Friendly', 'Professional', 'Playful', 'Bold', 'Calm', 'Premium', 'Direct', 'Honest', 'Helpful'] as const
export const MAX_VOICE = 3

// Keeps only words from the list, once each, up to the limit. Anything else in storage is dropped.
export const cleanVoice = (words: readonly string[] | undefined): string[] => {
  const known = new Set<string>(VOICE_WORDS)
  const kept: string[] = []
  for (const word of words ?? []) if (known.has(word) && !kept.includes(word) && kept.length < MAX_VOICE) kept.push(word)
  return kept
}

// The sentence the brand plan says about how the business sounds.
export const voiceSentence = (words: readonly string[]): string => {
  const list = words.map((word) => word.toLowerCase())
  if (list.length === 0) return ''
  if (list.length === 1) return `Your brand sounds ${list[0]}.`
  return `Your brand sounds ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}.`
}
