import { checkLogoContent, checkLogoFile, type LogoCheck } from './logoHandoff.ts'
import { dataUrlPrefix, logoSaveSchema, type LogoSave } from './logoSave.ts'
import { documentStorage } from './storage.ts'

// The project's logo, through the document storage. Every call is asynchronous. Writing it does not tell the listeners that a document was saved: the
// notebook has nothing to note about an image.
export { logoSaveSchema, type LogoSave } from './logoSave.ts'

export async function loadLogo(projectId: string): Promise<LogoSave | null> {
  const parsed = logoSaveSchema.safeParse(await documentStorage().read(projectId, 'logo'))
  return parsed.success ? parsed.data : null
}

export function clearLogo(projectId: string): Promise<void> {
  return documentStorage().remove(projectId, 'logo')
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  const chunk = 0x8000
  for (let at = 0; at < bytes.length; at += chunk) binary += String.fromCharCode(...bytes.subarray(at, at + chunk))
  return btoa(binary)
}

export type ImportResult = { ok: true; logo: LogoSave } | { ok: false; reason: string }

// Checks the file (type and size, then what is in it) and keeps it as the project's logo. The reason it was refused, or that it could not be stored,
// is in words the founder can act on. The file is only read, never sent anywhere.
export async function importLogo(projectId: string, file: File, now: string = new Date().toISOString()): Promise<ImportResult> {
  const first: LogoCheck = checkLogoFile(file)
  if (!first.ok) return first
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return { ok: false, reason: 'That file could not be read. Try adding it again.' }
  }
  const second = checkLogoContent(first.kind, bytes)
  if (!second.ok) return second
  const logo: LogoSave = { kind: first.kind, name: file.name.slice(0, 120), size: bytes.length, dataUrl: `${dataUrlPrefix(first.kind)}${toBase64(bytes)}`, savedAt: now }
  if (!(await documentStorage().write(projectId, 'logo', logo))) return { ok: false, reason: 'The logo could not be stored. Check your connection and try again.' }
  return { ok: true, logo }
}
