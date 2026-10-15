import { IMAGE_MIMES, MAX_ATTACHMENTS, MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_TEXT_CHARS, MAX_TOTAL_BYTES, type Attachment, type AttachmentKind } from '../compose/attachments.ts'

// Reading a file the founder picked into something that can go with a message: checked first (kind and size, in words that say what to do), then
// read in the browser and never uploaded anywhere but with the message itself. A picture is shrunk first, so a photo straight from a phone is a few hundred
// kilobytes and not several megabytes. Nothing here keeps a file: it lives in the message bar until it is sent or removed.

// What each menu item lets the picker show.
export const ACCEPT: Record<AttachmentKind, string> = {
  image: '.png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif',
  pdf: '.pdf,application/pdf',
  text: '.txt,.md,.markdown,.csv,.tsv,.json,.log,text/plain,text/markdown,text/csv,application/json',
}

// A file waiting in the bar: what goes with the message, and what to show of it.
export type PendingFile = { id: string; name: string; kind: AttachmentKind; bytes: number; attachment: Attachment }

export type ReadResult = { ok: true; file: PendingFile } | { ok: false; reason: string }

const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|json|log)$/i
// The most of a text file that is read at all, before its length in characters is checked.
const MAX_TEXT_BYTES = 400_000
// The longest side of a picture that is sent, and the quality it is saved at, then a smaller try if it is still too big.
const IMAGE_SIDES = [1600, 1200, 900]
const IMAGE_QUALITIES = [0.85, 0.7, 0.55]

export function kindOfFile(file: { name: string; type: string }): AttachmentKind | null {
  const name = file.name.toLowerCase()
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif|bmp|svg|tiff?)$/.test(name)) return 'image'
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (file.type.startsWith('text/') || file.type === 'application/json' || TEXT_EXTENSIONS.test(name)) return 'text'
  return null
}

const MEGABYTE = 1_000_000
const megabytes = (bytes: number) => `${(bytes / MEGABYTE).toFixed(1)} MB`

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  const chunk = 0x8000
  for (let at = 0; at < bytes.length; at += chunk) binary += String.fromCharCode(...bytes.subarray(at, at + chunk))
  return btoa(binary)
}

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, at) => bytes[at] === byte)

// Whether another file can join those already waiting: not more than three, and not more than 8 MB together.
export function checkRoom(waiting: PendingFile[], next: PendingFile): string | null {
  if (waiting.length >= MAX_ATTACHMENTS) return `You can attach up to ${MAX_ATTACHMENTS} files to one message. Remove one first.`
  if (waiting.reduce((total, file) => total + file.bytes, next.bytes) > MAX_TOTAL_BYTES) return `Those files are more than ${MAX_TOTAL_BYTES / MEGABYTE} MB together. Remove one, or attach a smaller one.`
  return null
}

// A picture made smaller: its longest side at most 1600 pixels, saved as a JPEG on white (a transparent picture would turn black), and made smaller again
// if it is still over the limit. Null where the browser cannot draw it, in which case the picture goes as it is if it is small enough.
async function shrinkImage(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return null
    let last: Blob | null = null
    for (const [index, side] of IMAGE_SIDES.entries()) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      last = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITIES[index]))
      if (last && last.size <= MAX_IMAGE_BYTES) return last
    }
    return last
  } finally {
    bitmap.close?.()
  }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export async function readAttachment(file: File): Promise<ReadResult> {
  const kind = kindOfFile(file)
  const name = file.name.slice(0, 120) || 'file'
  if (!kind) return { ok: false, reason: `${file.name || 'That file'} is not a kind Droplet can read. Attach a picture (PNG, JPG, WebP or GIF), a PDF, or a text file (txt, md, csv).` }
  if (file.size === 0) return { ok: false, reason: `${name} is empty.` }

  if (kind === 'image') {
    const type = file.type === 'image/jpg' ? 'image/jpeg' : file.type
    const known = (IMAGE_MIMES as readonly string[]).includes(type)
    if (!known && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) return { ok: false, reason: `${name} is a kind of picture Droplet cannot read. Use a PNG, JPG, WebP or GIF (a screenshot is usually a PNG).` }
    const shrunk = await shrinkImage(file)
    const blob = shrunk ?? file
    if (blob.size > MAX_IMAGE_BYTES) return { ok: false, reason: `${name} is ${megabytes(blob.size)}, and a picture can be at most ${megabytes(MAX_IMAGE_BYTES)} to send. Attach a smaller one.` }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const mime = shrunk ? 'image/jpeg' : (IMAGE_MIMES as readonly string[]).includes(type) ? (type as (typeof IMAGE_MIMES)[number]) : 'image/png'
    return { ok: true, file: { id: newId(), name, kind, bytes: bytes.length, attachment: { kind, name, mime: mime as (typeof IMAGE_MIMES)[number], data: toBase64(bytes) } } }
  }

  if (kind === 'pdf') {
    if (file.size > MAX_PDF_BYTES) return { ok: false, reason: `${name} is ${megabytes(file.size)}, and a PDF can be at most ${megabytes(MAX_PDF_BYTES)}. Attach a smaller one, or just the pages that matter.` }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { ok: false, reason: `${name} says it is a PDF but is not one.` }
    return { ok: true, file: { id: newId(), name, kind, bytes: bytes.length, attachment: { kind, name, mime: 'application/pdf', data: toBase64(bytes) } } }
  }

  if (file.size > MAX_TEXT_BYTES) return { ok: false, reason: `${name} is ${megabytes(file.size)}, which is too long to read. Attach the part that matters (up to ${MAX_TEXT_CHARS.toLocaleString('en-GB')} characters).` }
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, reason: `${name} could not be read. Try attaching it again.` }
  }
  if (text.includes('\u0000')) return { ok: false, reason: `${name} is not a text file.` }
  if (text.trim() === '') return { ok: false, reason: `${name} has no words in it.` }
  if (text.length > MAX_TEXT_CHARS) return { ok: false, reason: `${name} has ${text.length.toLocaleString('en-GB')} characters, and Droplet reads up to ${MAX_TEXT_CHARS.toLocaleString('en-GB')}. Attach the part that matters.` }
  return { ok: true, file: { id: newId(), name, kind, bytes: new TextEncoder().encode(text).length, attachment: { kind, name, text } } }
}

export const sizeLabel = (bytes: number) => (bytes < 1000 ? `${bytes} B` : bytes < MEGABYTE ? `${Math.round(bytes / 1000)} KB` : megabytes(bytes))
