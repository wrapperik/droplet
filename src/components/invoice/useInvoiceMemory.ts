import { useMemo, useState } from 'react'
import { fontPairById, type FontPair } from '../../lib/brandType.ts'
import type { InvoiceContent } from '../../lib/invoice.ts'
import { checkInvoice } from '../../lib/invoiceReadiness.ts'
import { resolveRoles } from '../../lib/palette.ts'
import { starterBlocks } from '../../compose/fallback.ts'
import { loadPalette } from '../../lib/projectStore.ts'
import { newId } from '../../lib/ids.ts'
import { useLoaded } from '../../hooks/useLoaded.ts'
import { useAlignedLogo } from '../../hooks/useAlignedLogo.ts'
import { useProjectLogo } from '../../hooks/useProjectLogo.ts'
import { loadMemory, saveMemory } from '../../lib/memoryStore.ts'
import type { ProjectMemory } from '../../lib/memorySave.ts'
import { businessStatus, clientStatus, emptyMemory, numbersInUse, savedInvoice, withBusiness, withClient, withInvoice } from '../../lib/projectMemory.ts'
import { invoiceDocOf, isInvoiceUnsaved, type InvoiceState } from '../../lib/invoiceState.ts'
import type { ConfirmItem } from './ConfirmSave.tsx'

export const sameContent = (a: InvoiceContent, b: InvoiceContent) => JSON.stringify(a) === JSON.stringify(b)

// What the invoice workspace and the guide share: what the project remembers, the confirmed palette, what confirming would remember,
// and the confirm itself. Nothing is remembered unless the founder confirms it, and only what they ticked.
export function useInvoiceMemory(projectId: string, state: InvoiceState, onConfirmed?: () => void, logoVersion = 0) {
  // What the project remembers and the confirmed palette are read from storage, which takes a moment. Until they have arrived the status says nothing
  // and saving waits, so nothing is judged against what has not been read yet.
  const { value: memory, loaded, set: setMemory } = useLoaded<ProjectMemory>(projectId, () => loadMemory(projectId), emptyMemory())
  const { value: brand } = useLoaded(
    projectId,
    async () => {
      const saved = await loadPalette(projectId)
      return { blocks: saved?.blocks ?? starterBlocks(), fonts: fontPairById(saved?.fonts) }
    },
    { blocks: starterBlocks(), fonts: undefined as FontPair | undefined },
  )
  const paletteBlocks = brand.blocks
  // The logo brought back from another tool: undefined until read, null if there is none. It is drawn on the page and in the PDF, and goes nowhere else.
  const stored = useProjectLogo(projectId, logoVersion)
  const logo = useAlignedLogo(stored)
  const [saveFailed, setSaveFailed] = useState(false)

  const doc = invoiceDocOf(state)
  const { content } = doc
  // How the invoice was when it was opened, so an invoice nobody has touched is not "changed".
  const [opened] = useState(content)

  // The brand: the palette the founder confirmed for this project, or the starter palette until there is one.
  const roles = useMemo(() => resolveRoles(paletteBlocks), [paletteBlocks])

  const saved = savedInvoice(memory, doc.invoiceId)
  const unsaved = loaded && isInvoiceUnsaved(doc, saved)
  // Changes that would be lost on leaving: anything different from what was confirmed, or from a new invoice if none was.
  const hasChanges = saved ? !sameContent(content, saved.content) : !sameContent(content, opened)
  const saveStatus = !loaded ? '' : saveFailed ? 'Could not save' : !saved ? 'Not saved yet' : unsaved ? 'Unsaved changes' : 'All changes saved'

  // What confirming would remember, so the founder sees it before anything is kept.
  const business = businessStatus(memory, content.business)
  const client = clientStatus(memory, content.client)
  const number = content.details.number.trim() || 'this invoice'
  const word = content.details.kind === 'quote' ? 'Quote' : 'Invoice'
  const items: ConfirmItem[] = [
    ...(business === 'new' || business === 'updated'
      ? [{ id: 'business', label: 'Your business details', detail: business === 'new' ? `${content.business.name.trim()}, ready on every invoice from now on.` : 'Replaces what is remembered about your business.' }]
      : []),
    ...(client === 'new' || client === 'updated'
      ? [{ id: 'client', label: content.client.name.trim(), detail: client === 'new' ? 'A new client, ready to pick next time.' : 'Replaces what is remembered about this client.' }]
      : []),
    ...(!saved || !sameContent(content, saved.content)
      ? [{ id: 'invoice', label: `${word} ${number}`, detail: saved ? `A new version of it. It keeps its number.` : 'Kept with its number, so it can be opened again.' }]
      : []),
  ]

  const persist = async (next: ProjectMemory) => {
    if (await saveMemory(projectId, next)) {
      setMemory(next)
      return true
    }
    setSaveFailed(true)
    return false
  }

  // Only what the founder ticked is remembered. Says whether it all went.
  const confirm = async (ids: string[]) => {
    const now = new Date().toISOString()
    let next = memory
    if (ids.includes('business')) next = withBusiness(next, content.business, now)
    if (ids.includes('client')) next = withClient(next, content.client, now, newId())
    if (ids.includes('invoice')) next = withInvoice(next, doc.invoiceId, content, now)
    const ok = next === memory || (await persist(next))
    setSaveFailed(!ok)
    if (ok) onConfirmed?.()
    return ok
  }

  // What the invoice still needs, in code, from what is on it.
  const readiness = useMemo(() => checkInvoice(content, { usedNumbers: numbersInUse(memory, doc.invoiceId) }), [content, memory, doc.invoiceId])

  return { memory, loaded, logo, storedLogo: stored, fonts: brand.fonts, doc, content, roles, saved, unsaved, hasChanges, saveStatus, business, client, number, items, persist, confirm, readiness }
}
