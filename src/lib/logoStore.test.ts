import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { slowMemoryStorage } from '../test/slowStorage.ts'
import { LOGO_MAX_BYTES } from './logoHandoff.ts'
import { logoSaveSchema } from './logoSave.ts'
import { clearLogo, importLogo, loadLogo } from './logoStore.ts'
import { setDocumentStorage } from './storage.ts'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>'
const file = (parts: BlobPart[], name: string, type: string) => new File(parts, name, { type })
const NOW = '2026-10-15T09:00:00.000Z'

let storage: ReturnType<typeof slowMemoryStorage>
let before: ReturnType<typeof setDocumentStorage>
beforeEach(() => {
  storage = slowMemoryStorage(1)
  before = setDocumentStorage(storage.driver)
})
afterEach(() => {
  setDocumentStorage(before)
})

describe('importing the logo', () => {
  it('keeps a PNG as a data address with its name, kind and size', async () => {
    const result = await importLogo('p1', file([PNG], 'kindred.png', 'image/png'), NOW)
    expect(result.ok).toBe(true)
    const logo = await loadLogo('p1')
    expect(logo).toMatchObject({ kind: 'png', name: 'kindred.png', size: PNG.length, savedAt: NOW })
    expect(logo?.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(atob(logo!.dataUrl.split(',')[1])).toHaveLength(PNG.length)
  })

  it('keeps an SVG', async () => {
    const result = await importLogo('p1', file([svg], 'mark.svg', 'image/svg+xml'), NOW)
    expect(result.ok).toBe(true)
    expect((await loadLogo('p1'))?.dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true)
  })

  it('refuses another kind of file with a reason, and keeps nothing', async () => {
    const result = await importLogo('p1', file(['x'], 'logo.jpg', 'image/jpeg'), NOW)
    expect(!result.ok && result.reason).toMatch(/not a PNG or an SVG/)
    expect(storage.documents.size).toBe(0)
  })

  it('refuses a file over the limit with a reason, and keeps nothing', async () => {
    const big = new Uint8Array(LOGO_MAX_BYTES + 1)
    big.set(PNG)
    const result = await importLogo('p1', file([big], 'big.png', 'image/png'), NOW)
    expect(!result.ok && result.reason).toMatch(/limit is 1 MB/)
    expect(storage.documents.size).toBe(0)
  })

  it('refuses a file that is not what its name says', async () => {
    const result = await importLogo('p1', file(['not a png at all'], 'logo.png', 'image/png'), NOW)
    expect(!result.ok && result.reason).toMatch(/not one/)
    expect(await loadLogo('p1')).toBeNull()
  })

  it('refuses an SVG with a script in it', async () => {
    const result = await importLogo('p1', file(['<svg><script>1</script></svg>'], 'x.svg', 'image/svg+xml'), NOW)
    expect(!result.ok && result.reason).toMatch(/script/)
  })

  it('says so when it could not be stored', async () => {
    setDocumentStorage({ ...storage.driver, write: async () => false })
    const result = await importLogo('p1', file([PNG], 'kindred.png', 'image/png'), NOW)
    expect(!result.ok && result.reason).toMatch(/could not be stored/)
  })

  it('replaces the earlier logo, and can be cleared', async () => {
    await importLogo('p1', file([PNG], 'one.png', 'image/png'), NOW)
    await importLogo('p1', file([svg], 'two.svg', 'image/svg+xml'), NOW)
    expect((await loadLogo('p1'))?.name).toBe('two.svg')
    await clearLogo('p1')
    expect(await loadLogo('p1')).toBeNull()
  })

  it('is kept per project', async () => {
    await importLogo('p1', file([PNG], 'one.png', 'image/png'), NOW)
    expect(await loadLogo('p2')).toBeNull()
  })
})

describe('reading a saved logo', () => {
  it('ignores a value that cannot be drawn safely as an image', async () => {
    await storage.driver.write('p1', 'logo', { kind: 'png', name: 'x.png', size: 3, dataUrl: 'data:text/html;base64,PGI+', savedAt: NOW })
    expect(await loadLogo('p1')).toBeNull()
    await storage.driver.write('p1', 'logo', { kind: 'svg', name: 'x.svg', size: 3, dataUrl: 'javascript:alert(1)', savedAt: NOW })
    expect(await loadLogo('p1')).toBeNull()
  })

  it('refuses a data address that says it is the other kind', () => {
    expect(logoSaveSchema.safeParse({ kind: 'svg', name: 'x', size: 3, dataUrl: 'data:image/png;base64,AAAA', savedAt: NOW }).success).toBe(false)
  })
})
