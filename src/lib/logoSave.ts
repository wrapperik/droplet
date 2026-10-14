import { z } from 'zod'
import { LOGO_MAX_BYTES } from './logoHandoff.ts'

// The logo a founder brought back from another tool. Kept as one document per project, with the kind `logo`: the file itself as a data address,
// so the same row-level security that keeps the rest of the project to its owner keeps the logo too, and deleting the account deletes it with the
// rest. A logo is at most LOGO_MAX_BYTES, which is about 1.4 MB written as text, inside the 2 MB a document may be.

const PNG_PREFIX = 'data:image/png;base64,'
const SVG_PREFIX = 'data:image/svg+xml;base64,'

export const logoSaveSchema = z
  .object({
    kind: z.enum(['png', 'svg']),
    // The file's name as the founder had it, for the library.
    name: z.string().max(120),
    // Bytes in the file.
    size: z.number().int().min(1).max(LOGO_MAX_BYTES),
    dataUrl: z.string().max(Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 64),
    savedAt: z.string(),
  })
  // The data address must be the kind it says, so a stored value can only ever be drawn as an image.
  .refine((logo) => logo.dataUrl.startsWith(logo.kind === 'png' ? PNG_PREFIX : SVG_PREFIX), { message: 'The file is not the kind it says.' })

export type LogoSave = z.infer<typeof logoSaveSchema>

export const dataUrlPrefix = (kind: 'png' | 'svg') => (kind === 'png' ? PNG_PREFIX : SVG_PREFIX)
