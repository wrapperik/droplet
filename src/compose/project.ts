import { containsPrivateDetail } from '../lib/facts.ts'
import type { ProjectMemory } from '../lib/memorySave.ts'
import { currentFacts } from '../lib/projectMemory.ts'
import type { ProjectSnapshot } from './journey.ts'

// What the composer is told about the project: where the founder is on the journey. Only what a task needs. The business name and the offer
// are the founder's own words about their business, and the rest are counts. No client, address, contact or bank detail is sent.
export function snapshotOfProject(input: { projectName: string; memory: ProjectMemory; hasPalette: boolean; boardItems: number; hasLogo?: boolean }): ProjectSnapshot {
  const { memory } = input
  const businessName = (memory.idea?.name || memory.business?.details.name || '').trim()
  return {
    projectName: input.projectName.trim().slice(0, 80),
    businessName: businessName.slice(0, 80),
    offer: (memory.idea?.offer ?? '').trim().slice(0, 300),
    hasPalette: input.hasPalette,
    hasBusinessDetails: memory.business !== null && memory.business.details.name.trim() !== '',
    clients: Math.min(memory.clients.length, 1000),
    invoices: Math.min(memory.invoices.length, 1000),
    boardItems: Math.min(Math.max(input.boardItems, 0), 1000),
    ...(input.hasLogo ? { hasLogo: true } : {}),
    // The facts the founder confirmed. One with a private detail in it is left out, whatever put it there, since a fact is sent with every request.
    facts: Object.fromEntries(Object.entries(currentFacts(memory)).filter(([, value]) => !containsPrivateDetail(value))),
  }
}
