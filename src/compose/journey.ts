import { z } from 'zod'

// The founder's journey, in the order a business starting from nothing meets it, and what Droplet knows about where a project is on it.
// Kept free of anything from the interface, so the server function can use it too.
//
// The order is the pitch's: each step depends on the one before. The name is what the brand is built on, the colours (and fonts) are what a
// logo is briefed from, and an invoice carries the name, the colours and the logo.

export const JOURNEY_STEPS = ['name', 'values', 'palette', 'logo', 'invoice', 'email'] as const
export type JourneyStep = (typeof JOURNEY_STEPS)[number]

export const STEP_LABEL: Record<JourneyStep, string> = {
  name: 'Settle the name',
  values: 'Brand values and offer',
  palette: 'Choose the colours',
  logo: 'Get a logo',
  invoice: 'Make the first invoice',
  email: 'Write to a client',
}

// The workspaces that are built. A step with no workspace is done outside Droplet or by talking it through.
export type BuiltWorkspace = 'brand' | 'invoice' | 'board'

export const STEP_WORKSPACE: Record<JourneyStep, BuiltWorkspace | null> = {
  name: 'board',
  values: 'board',
  palette: 'brand',
  logo: null,
  invoice: 'invoice',
  email: null,
}

// What a tap on a step's Open button says, as the founder's own words. The composer is told these phrases, so it knows a tap is an outright ask.
export const OPEN_PHRASE: Record<BuiltWorkspace, string> = {
  brand: 'Open the brand workspace',
  invoice: 'Open the invoice workspace',
  board: 'Open the business idea board',
}

// The workspace a message asks for when it is exactly one of the Open phrases (a tap on a plan's Open button, or on a suggested reply). The app opens
// it in code before asking the composer anything, so it is one request and not two. Anything else the founder writes is the composer's to read.
export function workspaceForPhrase(text: string): BuiltWorkspace | null {
  const said = text.trim()
  return (Object.keys(OPEN_PHRASE) as BuiltWorkspace[]).find((workspace) => OPEN_PHRASE[workspace] === said) ?? null
}

// What the project holds, as the composer is told it. Only what a task needs: the business name, the offer and counts, never a detail of a
// client, an address, a contact or a bank account.
export const projectSnapshotSchema = z.object({
  projectName: z.string().max(80),
  // The name the founder decided on, or the name of the business on their invoices. Empty if there is none yet.
  businessName: z.string().max(80),
  // What the founder decided they offer. Empty if they have not confirmed one.
  offer: z.string().max(300),
  // A palette has been saved to the project.
  hasPalette: z.boolean(),
  hasBusinessDetails: z.boolean(),
  clients: z.number().int().min(0).max(1000),
  invoices: z.number().int().min(0).max(1000),
  // Things on the saved board, so the composer can tell a board in use from an empty one.
  boardItems: z.number().int().min(0).max(1000),
})
export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>

// The steps the app can tell are done, from what the project holds. The others (values, logo, client email) are the founder's to say.
export function doneSteps(project: ProjectSnapshot | undefined): Set<JourneyStep> {
  const done = new Set<JourneyStep>()
  if (!project) return done
  if (project.businessName.trim() !== '') done.add('name')
  if (project.hasPalette) done.add('palette')
  if (project.invoices > 0) done.add('invoice')
  return done
}

const TRACKED: JourneyStep[] = ['name', 'palette', 'invoice']

// The project in words, for the composer.
export function describeProject(project: ProjectSnapshot): Record<string, unknown> {
  const done = doneSteps(project)
  return {
    projectName: project.projectName,
    businessName: project.businessName || null,
    offer: project.offer || null,
    steps: JOURNEY_STEPS.map((step) => ({
      step,
      what: STEP_LABEL[step],
      status: TRACKED.includes(step) ? (done.has(step) ? 'in the project' : 'not in the project yet') : 'not tracked by the app: go by what the founder has said',
    })),
    savedBusinessDetails: project.hasBusinessDetails,
    savedClients: project.clients,
    savedInvoices: project.invoices,
    boardItems: project.boardItems,
  }
}
