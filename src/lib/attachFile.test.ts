import { describe, expect, it } from 'vitest'
import { MAX_ATTACHMENTS, MAX_PDF_BYTES, MAX_TEXT_CHARS, MAX_TOTAL_BYTES } from '../compose/attachments.ts'
import { checkRoom, kindOfFile, readAttachment, sizeLabel, type PendingFile } from './attachFile.ts'

const file = (parts: BlobPart[], name: string, type: string) => new File(parts, name, { type })
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const PDF = new TextEncoder().encode('%PDF-1.4\n% a small one')

describe('what kind a file is', () => {
  it('is told from its type or its name', () => {
    expect(kindOfFile({ name: 'a.png', type: 'image/png' })).toBe('image')
    expect(kindOfFile({ name: 'photo.HEIC', type: '' })).toBe('image')
    expect(kindOfFile({ name: 'brief.pdf', type: 'application/pdf' })).toBe('pdf')
    expect(kindOfFile({ name: 'notes.md', type: '' })).toBe('text')
    expect(kindOfFile({ name: 'data.csv', type: 'text/csv' })).toBe('text')
    expect(kindOfFile({ name: 'a.json', type: 'application/json' })).toBe('text')
    expect(kindOfFile({ name: 'song.mp3', type: 'audio/mpeg' })).toBeNull()
    expect(kindOfFile({ name: 'a.docx', type: '' })).toBeNull()
  })
})

describe('reading a file to send', () => {
  it('reads a text file as its words, and keeps its name', async () => {
    const result = await readAttachment(file(['# Ideas\n- Kindred Gifting'], 'notes.md', 'text/markdown'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.file.attachment).toEqual({ kind: 'text', name: 'notes.md', text: '# Ideas\n- Kindred Gifting' })
  })

  it('refuses a text file that is empty, is not text, or is too long, with a reason that says what to do', async () => {
    const empty = await readAttachment(file(['   \n'], 'blank.txt', 'text/plain'))
    expect(!empty.ok && empty.reason).toMatch(/no words/)
    const binary = await readAttachment(file([new Uint8Array([72, 105, 0, 1, 2])], 'odd.txt', 'text/plain'))
    expect(!binary.ok && binary.reason).toMatch(/not a text file/)
    const long = await readAttachment(file(['x'.repeat(MAX_TEXT_CHARS + 1)], 'long.txt', 'text/plain'))
    expect(!long.ok && long.reason).toMatch(/Attach the part that matters/)
    const huge = await readAttachment(file(['x'.repeat(500_000)], 'huge.txt', 'text/plain'))
    expect(!huge.ok && huge.reason).toMatch(/too long to read/)
  })

  it('reads a PDF as base64, after checking it really is one', async () => {
    const result = await readAttachment(file([PDF], 'brief.pdf', 'application/pdf'))
    expect(result.ok).toBe(true)
    if (result.ok && result.file.attachment.kind === 'pdf') {
      expect(atob(result.file.attachment.data)).toContain('%PDF-1.4')
      expect(result.file.attachment.mime).toBe('application/pdf')
    }
    const fake = await readAttachment(file(['not really a pdf'], 'fake.pdf', 'application/pdf'))
    expect(!fake.ok && fake.reason).toMatch(/says it is a PDF but is not one/)
  })

  it('refuses a PDF over the limit, with the sizes', async () => {
    const big = new Uint8Array(MAX_PDF_BYTES + 1)
    big.set(PDF)
    const result = await readAttachment(file([big], 'big.pdf', 'application/pdf'))
    expect(!result.ok && result.reason).toMatch(/4\.0 MB.*at most 4\.0 MB|can be at most 4\.0 MB/)
  })

  it('reads a small picture as it is where the browser cannot redraw it, keeping its type', async () => {
    const result = await readAttachment(file([PNG], 'shot.png', 'image/png'))
    expect(result.ok).toBe(true)
    if (result.ok && result.file.attachment.kind === 'image') expect(result.file.attachment.mime).toBe('image/png')
  })

  it('refuses a kind of picture the model cannot read, and a file of a kind that is not offered', async () => {
    const heic = await readAttachment(file([PNG], 'photo.heic', 'image/heic'))
    expect(!heic.ok && heic.reason).toMatch(/cannot read.*PNG, JPG, WebP or GIF/)
    const audio = await readAttachment(file(['x'], 'song.mp3', 'audio/mpeg'))
    expect(!audio.ok && audio.reason).toMatch(/Attach a picture.*a PDF.*a text file/)
    const empty = await readAttachment(file([], 'empty.png', 'image/png'))
    expect(!empty.ok && empty.reason).toMatch(/is empty/)
  })

  it('refuses a picture that is too big to send when it cannot be made smaller', async () => {
    const big = new Uint8Array(2_100_000)
    big.set(PNG)
    const result = await readAttachment(file([big], 'big.png', 'image/png'))
    expect(!result.ok && result.reason).toMatch(/Attach a smaller one/)
  })
})

describe('room for another file', () => {
  const pending = (bytes: number, id = 'a'): PendingFile => ({ id, name: `${id}.txt`, kind: 'text', bytes, attachment: { kind: 'text', name: `${id}.txt`, text: 'x' } })

  it('is up to three files', () => {
    const three = Array.from({ length: MAX_ATTACHMENTS }, (_, i) => pending(10, String(i)))
    expect(checkRoom(three.slice(0, 2), pending(10, 'z'))).toBeNull()
    expect(checkRoom(three, pending(10, 'z'))).toMatch(/up to 3 files/)
  })

  it('is 8 MB together', () => {
    expect(checkRoom([pending(MAX_TOTAL_BYTES - 100)], pending(50))).toBeNull()
    expect(checkRoom([pending(MAX_TOTAL_BYTES - 100)], pending(200))).toMatch(/more than 8 MB together/)
  })
})

describe('the size shown for a file', () => {
  it('is in bytes, kilobytes or megabytes', () => {
    expect(sizeLabel(512)).toBe('512 B')
    expect(sizeLabel(48_000)).toBe('48 KB')
    expect(sizeLabel(2_500_000)).toBe('2.5 MB')
  })
})
