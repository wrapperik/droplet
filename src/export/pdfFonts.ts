// The brand typefaces as files the PDF library can embed. The page draws the variable fonts the brand guide shows; this library cannot read those, so the PDF is
// given the static regular and bold files of the same families (`@fontsource`, SIL Open Font License). Each is a URL the library fetches when the PDF is made.
import dmsans400 from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff?url'
import dmsans700 from '@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff?url'
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url'
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url'
import playfairdisplay400 from '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff?url'
import playfairdisplay700 from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url'
import fraunces400 from '@fontsource/fraunces/files/fraunces-latin-400-normal.woff?url'
import fraunces700 from '@fontsource/fraunces/files/fraunces-latin-700-normal.woff?url'
import spacegrotesk400 from '@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff?url'
import spacegrotesk700 from '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff?url'
import lora400 from '@fontsource/lora/files/lora-latin-400-normal.woff?url'
import lora700 from '@fontsource/lora/files/lora-latin-700-normal.woff?url'

export const PDF_FONTS: Record<string, { regular: string; bold: string }> = {
  'DM Sans': { regular: dmsans400, bold: dmsans700 },
  'Inter': { regular: inter400, bold: inter700 },
  'Playfair Display': { regular: playfairdisplay400, bold: playfairdisplay700 },
  'Fraunces': { regular: fraunces400, bold: fraunces700 },
  'Space Grotesk': { regular: spacegrotesk400, bold: spacegrotesk700 },
  'Lora': { regular: lora400, bold: lora700 },
}
