import { z } from 'zod'
import { FACT_KEYS } from '../lib/facts.ts'
import { NOTES_TITLES } from './digest.ts'
import type { ComposeRequest } from './spec.ts'

// What Droplet was given to answer a message, in the app's words, for the quiet line under a reply: "Used: your saved palette, business name, 2 earlier chats".
// It is built in code from the request that was actually sent, never from what the model says it used (`memoryUsed`), so it cannot claim more or less than
// went. Pressing the line lists each thing, and says what was never sent.
//
// Kept free of anything from the interface, so the tests and the server can use it.

export const usedItemSchema = z.object({
  // Short, for the line.
  label: z.string().max(60),
  // One sentence for the list, saying exactly what of it was sent.
  detail: z.string().max(200),
})
export type UsedItem = z.infer<typeof usedItemSchema>

export const usedSchema = z.object({ items: z.array(usedItemSchema).max(14) })
export type Used = z.infer<typeof usedSchema>

// Always shown with the list. Sums, contrast and the rest of a founder's private detail stay in the app (interviewees would not give an AI their client or
// financial details).
export const NOT_SENT = 'Not sent: addresses, contact details and bank details, yours or your clients’.'

const plural = (count: number, one: string, many: string = `${one}s`) => `${count} ${count === 1 ? one : many}`

// "Used: ..." as one line, or what to say when nothing but the message went.
export function usedLine(used: Used): string {
  return used.items.length === 0 ? 'Used: only your message' : `Used: ${used.items.map((item) => item.label.toLowerCase()).join(', ')}`
}

// The things that went with a request, in the order the model reads them. `searched` is what the reply searched the web for, if it did: the search is the
// model's to decide, so it is listed only when it happened.
export function usedOf(request: ComposeRequest, options: { searched?: string[] } = {}): Used {
  const items: UsedItem[] = []
  const add = (label: string, detail: string) => items.push({ label, detail })

  if (request.history && request.history.length > 0) add('This chat', `The ${plural(request.history.length, 'message')} before this one, so a follow-up makes sense.`)

  if (request.view === 'brand' && request.workspace) add('The palette on screen', `${plural(request.workspace.blocks.length, 'colour')} with their roles, which one is selected, and the contrast figures worked out by the app.`)
  if (request.view === 'invoice' && request.invoice) {
    const step = request.guide ? ` and the guide step you are on (${request.guide.position} of ${request.guide.of})` : ''
    add('The invoice on screen', `Its number, dates, terms, the client’s name, the lines and totals, and what is still missing${step}. No addresses, contact details or bank details.`)
  }
  if (request.view === 'board' && request.board) {
    const shown = request.board.items.length
    add('The board on screen', `${plural(shown, 'thing')}${request.board.more > 0 ? ` (and ${request.board.more} more not shown)` : ''} with their words and frames, and what is selected.`)
  }

  if (request.memory) add('Your saved palette', `${plural(request.memory.colours.length, 'colour')} with their hex codes and roles.`)

  const project = request.project
  if (project) {
    if (project.businessName.trim() !== '') add('Business name', 'The name you decided on, or the name on your invoices.')
    if (project.offer.trim() !== '') add('Offer', 'What you said you offer.')
    const facts = Object.keys(project.facts ?? {}).filter((key) => FACT_KEYS.includes(key as (typeof FACT_KEYS)[number])).length
    if (facts > 0) add('What you told me about the business', `${plural(facts, 'fact')} you confirmed, in your words.`)
    const saved = [
      project.hasPalette ? 'a palette' : '',
      project.boardItems > 0 ? `${plural(project.boardItems, 'thing')} on the board` : '',
      project.invoices > 0 ? plural(project.invoices, 'invoice') : '',
      project.clients > 0 ? plural(project.clients, 'client') : '',
      project.hasBusinessDetails ? 'business details' : '',
    ].filter(Boolean)
    if (saved.length > 0) add('What is saved', `Only that there are ${saved.join(', ')}: counts, not what is in them.`)
  }

  if (request.library && request.library.invoices.length > 0) {
    add('Your saved invoices', `${plural(request.library.invoices.length, 'invoice')} by number, client name and where each stands. No amounts.`)
  }

  if (request.earlierChats && request.earlierChats.length > 0) {
    const when = [...new Set(request.earlierChats.map((entry) => entry.when).filter(Boolean))].join(', ')
    add(request.earlierChats.length === 1 ? 'An earlier chat' : `${request.earlierChats.length} earlier chats`, `A short memory of ${request.earlierChats.length === 1 ? 'a chat' : 'chats'}${when ? ` (${when})` : ''}, not the whole conversation.`)
  }

  for (const digest of request.notes?.digests ?? []) add(`Notes on ${NOTES_TITLES[digest.workspace].toLowerCase()}`, `Droplet’s short summary of what your ${NOTES_TITLES[digest.workspace].toLowerCase()} holds.`)
  const found = request.notes?.found ?? []
  if (found.length > 0) {
    const dates = [...new Set(found.map((entry) => entry.at).filter(Boolean))].slice(0, 3).join(', ')
    add('Lines from your notes', `${plural(found.length, 'line')} that match what you asked, in your own words${dates ? ` (from ${dates})` : ''}.`)
  }

  const queries = options.searched ?? []
  if (queries.length > 0) add('Google Search', `It searched the web for ${queries.map((query) => `“${query}”`).join(', ')}. Nothing private goes in a search.`)

  return { items }
}

// What a reply is being made from, as a phrase for the progress line: "this chat, your saved palette and 2 earlier chats". Built from the same list as the
// line under the reply, so what is said while Droplet works is what is listed afterwards. Counts-only items ("What is saved") are left out, and at most
// three things are named (the line is shown in the thread while Droplet works, so it stays short).
const WORKING_FROM: Record<string, string> = {
  'This chat': 'this chat',
  'The palette on screen': 'the palette on screen',
  'The invoice on screen': 'the invoice on screen',
  'The board on screen': 'the board on screen',
  'Your saved palette': 'your saved palette',
  'Business name': 'your business name',
  Offer: 'your offer',
  'What you told me about the business': 'what you told me',
  'Your saved invoices': 'your saved invoices',
  'Lines from your notes': 'lines from your notes',
}

export function workingFrom(used: Used): string {
  const phrases: string[] = []
  for (const item of used.items) {
    const known = WORKING_FROM[item.label]
    const phrase = known ?? (/earlier chat/i.test(item.label) ? item.label.toLowerCase() : /^Notes on /.test(item.label) ? `my notes on ${item.label.slice('Notes on '.length)}` : null)
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase)
  }
  if (phrases.length === 0) return ''
  const shown = phrases.slice(0, 3)
  const more = phrases.length - shown.length
  const all = more > 0 ? [...shown, `${more} more`] : shown
  return all.length === 1 ? all[0] : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`
}
