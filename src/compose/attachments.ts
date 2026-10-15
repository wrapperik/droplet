import { z } from 'zod'

// Files a founder attaches to a message so Droplet can read them: a photo or screenshot, a PDF, or a text file (txt, md, csv and the like). They go with that one
// message only, are read by the model and are never stored (the saved chat keeps only the name and kind). The browser checks and shrinks them first; the
// server checks them again with the same schema, so a file the browser would have refused cannot arrive.
//
// Kept free of anything from the interface, so the server and the tests can use it.

export const MAX_ATTACHMENTS = 3
// What each kind may weigh. An image is shrunk in the browser before it is sent, so its limit is for what is sent, not for what was picked.
export const MAX_IMAGE_BYTES = 2_000_000
export const MAX_PDF_BYTES = 4_000_000
export const MAX_TEXT_CHARS = 60_000
// Everything attached to one message, as the files are (before base64 makes them a third larger).
export const MAX_TOTAL_BYTES = 8_000_000

export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

// The longest a base64 string for a file of this many bytes can be.
const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const name = z.string().trim().min(1).max(120)

export const attachmentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('image'),
    name,
    mime: z.enum(IMAGE_MIMES),
    // The picture, base64 encoded.
    data: z.string().min(8).max(base64Length(MAX_IMAGE_BYTES)).regex(BASE64),
  }),
  z.object({
    kind: z.literal('pdf'),
    name,
    mime: z.literal('application/pdf'),
    data: z.string().min(8).max(base64Length(MAX_PDF_BYTES)).regex(BASE64),
  }),
  z.object({
    kind: z.literal('text'),
    name,
    // The words of the file, as text.
    text: z.string().min(1).max(MAX_TEXT_CHARS),
  }),
])
export type Attachment = z.infer<typeof attachmentSchema>
export type AttachmentKind = Attachment['kind']

export const attachmentsField = z
  .array(attachmentSchema)
  .max(MAX_ATTACHMENTS)
  .refine((files) => files.reduce((total, file) => total + ('data' in file ? Math.floor((file.data.length * 3) / 4) : file.text.length), 0) <= MAX_TOTAL_BYTES, {
    message: 'Those files are too big together.',
  })

// What the model is given to read as a file the browser sends: the picture or the PDF, as the API takes it. A text file is part of the prompt instead.
export type InlineFile = { mime: string; data: string }
export const inlineFilesOf = (attachments: Attachment[] | undefined): InlineFile[] =>
  (attachments ?? []).flatMap((file) => (file.kind === 'text' ? [] : [{ mime: file.mime, data: file.data }]))

// What the founder sees and the log keeps of a file: its name and kind, never its contents.
export type AttachmentNote = { name: string; kind: AttachmentKind }
export const noteOf = (file: Attachment): AttachmentNote => ({ name: file.name, kind: file.kind })

export const KIND_WORDS: Record<AttachmentKind, string> = { image: 'image', pdf: 'PDF', text: 'text file' }
