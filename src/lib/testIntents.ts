// Temporary keyword matching for the colour picker test. The composition engine replaces this.
export function isColourPaletteIntent(text: string): boolean {
  return /\bcolou?r palette\b/i.test(text)
}
