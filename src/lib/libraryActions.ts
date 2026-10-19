import { starterBlocks } from '../compose/fallback.ts'
import { exportBlockedReason, exportBoard, type BoardFormat } from './boardExport.ts'
import { loadBoard, markBoardExported } from './boardStore.ts'
import { exportInvoice } from './exportInvoice.ts'
import { exportBrandSheet } from './exportSheet.ts'
import { checkInvoice } from './invoiceReadiness.ts'
import { fontPairById } from './brandType.ts'
import { loadLogo } from './logoStore.ts'
import { loadMemory, saveMemory } from './memoryStore.ts'
import { resolveRoles } from './palette.ts'
import { forgetClient, forgetFact, forgetInvoice, markExported, numbersInUse, savedInvoice } from './projectMemory.ts'
import { forgetNamedPalette, loadPalette, markPaletteExported } from './projectStore.ts'

// What the library does to what is saved: export it, or forget it. The Library screen and the composer's actions both call these, so a person and
// Droplet do exactly the same thing. Each works from what is saved, never from a workspace that may hold something else, and says in words how it
// ended. Nothing here writes anything the founder did not ask for.

// Where a library item's Open goes. The Library screen asks Home to do it, since the workspaces live there.
export type OpenTarget =
  // The brand workspace; with `paletteId`, with that named palette loaded into it.
  | { kind: 'brand'; paletteId?: string }
  | { kind: 'board' }
  | { kind: 'invoice'; id: string }
  | { kind: 'copy_invoice'; id: string }
  | { kind: 'new_invoice'; clientId?: string }
  // The invoice workspace with the Your business step open.
  | { kind: 'business_details' }

export type ExportTarget = { kind: 'brand' } | { kind: 'ideas'; format: BoardFormat } | { kind: 'invoice'; id: string }
export type ActionResult = { ok: true; text: string } | { ok: false; reason: string }

const fail = (reason: string): ActionResult => ({ ok: false, reason })

export async function exportLibraryItem(projectId: string, projectName: string, target: ExportTarget): Promise<ActionResult> {
  if (target.kind === 'brand') {
    const palette = await loadPalette(projectId)
    if (!palette) return fail('No palette is saved yet.')
    if (!(await exportBrandSheet(palette.blocks, projectName))) return fail('The brand sheet could not be made.')
    await markPaletteExported(projectId)
    return { ok: true, text: 'The brand sheet was downloaded.' }
  }
  if (target.kind === 'ideas') {
    const board = await loadBoard(projectId)
    const blocked = board ? exportBlockedReason(board.items) : 'No board is saved yet.'
    if (!board || blocked) return fail(blocked ?? 'No board is saved yet.')
    if (!(await exportBoard(target.format, { items: board.items, projectName }))) return fail('The file could not be made.')
    await markBoardExported(projectId)
    return { ok: true, text: `The board was downloaded as a ${target.format.toUpperCase()}.` }
  }
  const memory = await loadMemory(projectId)
  const invoice = savedInvoice(memory, target.id)
  if (!invoice) return fail('That invoice is not saved any more.')
  // The same check the invoice's own Export makes: what is required must be there, and it names what is not.
  const readiness = checkInvoice(invoice.content, { usedNumbers: numbersInUse(memory, invoice.id) })
  if (!readiness.ready) return fail(`It is not ready to export. ${readiness.required.map((issue) => issue.text).join(' ')}`)
  const palette = await loadPalette(projectId)
  const roles = resolveRoles(palette?.blocks ?? starterBlocks())
  if (!(await exportInvoice(invoice.content, roles, await loadLogo(projectId), fontPairById(palette?.fonts)))) return fail('The invoice PDF could not be made.')
  await saveMemory(projectId, markExported(await loadMemory(projectId), invoice.id, new Date().toISOString()))
  return { ok: true, text: 'The invoice was downloaded.' }
}

export type ForgetTarget = { kind: 'idea' } | { kind: 'invoice'; id: string } | { kind: 'client'; id: string } | { kind: 'palette'; id: string }

// Forgets one thing the project remembered. The caller asks twice first; this only does it.
export async function forgetLibraryItem(projectId: string, target: ForgetTarget): Promise<boolean> {
  if (target.kind === 'palette') return forgetNamedPalette(projectId, target.id)
  const memory = await loadMemory(projectId)
  const next =
    target.kind === 'invoice' ? forgetInvoice(memory, target.id) : target.kind === 'client' ? forgetClient(memory, target.id) : forgetFact(forgetFact(memory, 'business.name'), 'business.offer')
  return saveMemory(projectId, next)
}
