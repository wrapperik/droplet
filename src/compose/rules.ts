import { containsPrivateDetail, factFits, factText, FACT_INFO } from '../lib/facts.ts'
import { openWorkspace } from '../lib/workspaceState.ts'
import { applyTurnActions } from './applyActions.ts'
import { applyBoardTurnActions } from './boardActions.ts'
import { checkBlocks } from './blocks.ts'
import { stateOfBoardSnapshot } from './boardSnapshot.ts'
import type { BoardSnapshot, BoardTurn, BoardTurnAction } from './boardSpec.ts'
import { stateOfSnapshot } from './snapshot.ts'
import { amountsIn, applyInvoiceTurnActions, priceWasGiven } from './invoiceActions.ts'
import type { InvoiceSnapshot, InvoiceTurnAction } from './invoiceSpec.ts'
import { stateOfInvoiceSnapshot } from './invoiceSnapshot.ts'
import { findInvoice } from '../lib/library.ts'
import { isScreenAction, WORKSPACE_NAMES, type ScreenAction } from './screenActions.ts'
import { isBoardAction, isInvoiceAction, type AnyTurn, type ComposeRequest, type InvoiceTurn, type PaletteAction, type Turn, type WorkspaceSnapshot } from './spec.ts'

// Business rules for a turn, checked in code after the shape is right. The actions are tried against the workspace
// the founder is looking at, through the same code that will apply them, so anything that could not be done is
// caught here, with a reason written to be sent back to the model if it has to try again.

export function checkTurn(turn: Turn, workspace?: WorkspaceSnapshot): string[] {
  if (turn.actions.every(isScreenAction)) return []

  // Only a brand turn touches the workspace. Anything else is a conversation.
  if (turn.task !== 'brand') {
    return [`Only a brand task may include actions. Leave actions empty for the task "${turn.task}", and put your answer in the message.`]
  }

  const result = applyTurnActions({
    base: workspace ? stateOfSnapshot(workspace) : null,
    open: (blocks) => openWorkspace(blocks),
    actions: turn.actions.filter((action): action is PaletteAction => !isScreenAction(action)),
    env: { layout: workspace?.layout ?? [], heights: {} },
  })
  return result.skipped.map((skipped) => `Action ${skipped.position + 1} (${skipped.action.type}): ${skipped.reason}`)
}

// What the founder wrote in this request and the earlier ones: the only place a price may come from.
export const founderTextOf = (request: Pick<ComposeRequest, 'intent' | 'history'>): string[] => [
  request.intent,
  ...(request.history ?? []).filter((message) => message.role === 'founder').map((message) => message.text),
]

// The same checks for a reply about the invoice: the actions are tried against the invoice the founder is looking at, through the
// same code that will apply them, including the rule that a price must be one the founder wrote.
export function checkInvoiceTurn(turn: InvoiceTurn, invoice: InvoiceSnapshot | undefined, founderText: string[]): string[] {
  if (turn.actions.every(isScreenAction)) return []
  if (turn.task !== 'invoice') {
    return [`Only an invoice task may include actions on the invoice. Leave actions empty for the task "${turn.task}", and put your answer in the message.`]
  }
  if (!invoice) return ['There is no invoice open to act on. Leave actions empty.']
  const result = applyInvoiceTurnActions({
    base: stateOfInvoiceSnapshot(invoice),
    actions: turn.actions.filter((action): action is InvoiceTurnAction => !isScreenAction(action)),
    clients: invoice.savedClients.map((name) => ({ name })),
    founderText,
  })
  return result.skipped.map((skipped) => `Action ${skipped.position + 1} (${skipped.action.type}): ${skipped.reason}`)
}

// The same checks for a reply about the board: the actions are tried against the board the founder is looking at, through the same code that
// will apply them, including where things are to go, which that code finds and the model never gives.
export function checkBoardTurn(turn: BoardTurn, board: BoardSnapshot | undefined, founderText = ''): string[] {
  if (turn.actions.every(isScreenAction)) return []
  if (turn.task !== 'ideation') {
    return [`Only an ideation task may include actions on the board. Leave actions empty for the task "${turn.task}", and put your answer in the message.`]
  }
  if (!board) return ['There is no board open to act on. Leave actions empty.']
  const counter = (() => {
    let n = 0
    return () => `check-${++n}`
  })()
  const result = applyBoardTurnActions({ base: stateOfBoardSnapshot(board), actions: turn.actions.filter((action): action is BoardTurnAction => !isScreenAction(action)), view: board.view, newId: counter, founderText })
  return result.skipped.map((skipped) => `Action ${skipped.position + 1} (${skipped.action.type}): ${skipped.reason}`)
}

// A rand amount written in a suggested reply, such as "R450" or "250 rand".
const RAND_AMOUNT = /\bR\s?\d|\d\s?(?:rand|zar)\b/i

// Words compared the way a person would: capitals, curly quotes, punctuation and spacing do not matter.
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()

// Words that make a quote a request for something to be made or opened, and words that make it a description of what the founder is doing.
// A bare "Colour palette" is a request; "Working on branding" is not.
const ACTIVITY = /\b(working on|working with|busy with|doing|building|started|starting|i am|i'm|im|we are|we're|i have|i've|we have|we've|got)\b/i
const REQUEST_CUE = /\b(open|make|create|build|set ?up|start|generate|give|show|need|want|can you|could you|would you|will you|please|let'?s|invoice|bill|add|put|draw up|get me|help)\b/i

// Opening a workspace is the founder's decision, never Droplet's. A reply that opens one must say the founder asked for it or agreed to it,
// and quote their words, and the quote has to be in what they just wrote. A model that opens a palette because it thinks one would help has
// nothing to quote, so it cannot.
export function checkOpening(turn: AnyTurn, request: Pick<ComposeRequest, 'intent' | 'history' | 'view'> & { workspace?: unknown }): string[] {
  // With no workspace on screen, palette actions are what open the palette. A request that carries the palette's workspace has it on screen.
  const opensPalette = request.view === undefined && request.workspace === undefined && turn.task === 'brand' && turn.actions.some((action) => action.type !== 'undo' && action.type !== 'redo' && !isScreenAction(action))
  const { opens } = turn
  // A reply that names the task of a workspace that is not on screen, and does nothing and asks nothing, is a reply that says it is opening
  // that workspace. Without `opens` the app does not open it, so the message would be untrue.
  const here: ComposeRequest['view'] | undefined = request.view ?? (request.workspace === undefined ? undefined : 'brand')
  const named = turn.task === 'invoice' ? 'invoice' : turn.task === 'brand' ? 'brand' : turn.task === 'ideation' ? 'board' : null
  if (!opens && named && named !== here && turn.actions.length === 0 && !turn.question) {
    return ['opens: this reply names a workspace\'s task but does nothing and asks nothing, and a workspace opens only with opens. If the founder asked for it or agreed to it, set opens with their exact words. If not, answer or ask your question, and use the task "chat" if you are only talking.']
  }
  if (!opens) {
    return opensPalette
      ? [
          'opens: this reply opens the palette but has no opens. If the founder asked for a palette, or agreed to your offer of one, add opens: { because: "asked" or "agreed", quote: their exact words from <request> } and keep the actions. If they did not ask for one, remove the actions and ask your question instead.',
        ]
      : []
  }
  const errors: string[] = []
  // A reply that opens a workspace and asks whether to open it says two things that cannot both be so.
  if (turn.question && /\bopen\b/i.test(turn.question) && turn.actions.length > 0) {
    errors.push('question: you are opening the workspace in this reply, so do not ask whether to open it. Ask about what you put in it.')
  }
  if (!plain(request.intent).includes(plain(opens.quote))) {
    errors.push(`opens.quote: "${opens.quote}" is not in the founder's message. Quote their own words from <request> exactly. If they did not ask for the workspace or agree to it, do not open it: leave opens out and actions empty, and ask your question.`)
  }
  // Said as a request. Someone saying what they are doing ("Working on branding", "I'm building a site") has not asked for anything to be opened,
  // and a model that quotes that to open a workspace is refused.
  if (ACTIVITY.test(opens.quote) && !REQUEST_CUE.test(opens.quote)) {
    errors.push(`opens.quote: "${opens.quote}" is a statement, not a request or an agreement. Saying what they are working on or building is not asking for a workspace. Do not open one: leave opens out and actions empty, and ask your question.`)
  }
  if (opens.because === 'agreed' && !request.history?.some((message) => message.role === 'droplet')) {
    errors.push('opens.because: "agreed" needs an earlier offer from you in <conversation>. If there is none, the founder has not agreed to anything yet.')
  }
  return errors
}

// The facts a reply offers the founder to remember. Droplet only proposes: each must be something the founder really wrote (the quote is checked
// against their words, compared as a person would), must hold no private detail, must not be a fact the project already holds with the same
// words, and a reply offers a key once.
// The founder's own words that Droplet was given in the notes: the lines of the index it was sent, and the ideas quoted in a digest. A digest's other
// lines were written by a model, so they are not the founder's words.
const quotesInNotes = (notes: ComposeRequest['notes']): string[] => [
  ...(notes?.found ?? []).map((entry) => entry.text.replace(/^\[[^\]]*\]\s*/, '').replace(/\s*\(kept in mind\)$/, '')),
  ...(notes?.digests ?? []).flatMap((entry) => [...entry.text.matchAll(/\u201c([^\u201d]+)\u201d/g)].map((match) => match[1])),
]

export function checkPropose(turn: AnyTurn, request: Pick<ComposeRequest, 'intent' | 'history' | 'project' | 'notes'>): string[] {
  const proposals = turn.propose
  if (!proposals || proposals.length === 0) return []
  const errors: string[] = []
  const said = [...founderTextOf(request), ...quotesInNotes(request.notes)].map(plain)
  const remembered = request.project?.facts ?? {}
  const seen = new Set<string>()
  proposals.forEach((proposal, index) => {
    const at = `propose.${index}`
    if (seen.has(proposal.key)) errors.push(`${at}: ${proposal.key} is proposed twice. Propose each fact once.`)
    seen.add(proposal.key)
    if (!said.some((text) => text.includes(plain(proposal.quote)))) {
      errors.push(`${at}.quote: "${proposal.quote}" is not in the founder's words. Quote what they wrote exactly, or leave this fact out: only what the founder has said can be proposed.`)
    }
    if (!factFits(proposal.value)) {
      errors.push(
        containsPrivateDetail(proposal.value)
          ? `${at}.value: a fact never holds an address, an email, a phone number or a bank detail. Leave it out or say it without the detail.`
          : `${at}.value: write the fact in a short plain line of up to 200 characters.`,
      )
    }
    const current = remembered[proposal.key]
    if (current !== undefined && factText(current) === factText(proposal.value)) {
      errors.push(`${at}: ${FACT_INFO[proposal.key].label} is already remembered with these words. Leave it out.`)
    }
  })
  return errors
}

// The question is shown after the message, so a message that asks it too asks it twice. A small model does this out of habit, so it is mended
// here and not refused (a refusal cost two attempts and fell back to "I changed nothing"): any trailing sentence of the message that asks
// something is taken off, as long as something else is left and it is not an item of a list.
export function withoutRepeatedQuestion<T extends { message: string; question?: string }>(turn: T): T {
  if (!turn.question) return turn
  let message = turn.message.trimEnd()
  for (;;) {
    const match = /(?:^|(?<=[.!?:])[ \t]+|\n+)([^.!?\n]*\?)$/.exec(message)
    if (!match || /^\s*(?:[-*\u2022]|\d+[.)])\s/.test(match[1])) break
    const rest = message.slice(0, match.index).trimEnd()
    if (rest === '') break
    message = rest
  }
  return message === turn.message.trimEnd() ? turn : { ...turn, message }
}

// The conversation part of a reply: a question is a question, replies belong to it, and on the invoice a reply never puts a price in the
// founder's mouth. A tapped reply is sent as the founder's own words, so a suggested figure would pass the check that prices come from them.
export function checkConversation(turn: AnyTurn, request: Pick<ComposeRequest, 'intent' | 'history' | 'view' | 'project' | 'notes'> & { workspace?: unknown }): string[] {
  const errors: string[] = [...checkBlocks(turn.blocks), ...checkOpening(turn, request), ...checkPropose(turn, request)]
  const { question, replies } = turn
  // A description from the illustrations, or a picture of a block from the conversation, written out instead of the words themselves.
  const placeholder = /\[(?:[A-Z][^\]\n]{14,}|(?:Plan|Checklist|Table)\b[^\]\n]*)\]/
  for (const [field, text] of [['message', turn.message], ['question', question ?? '']] as const) {
    if (placeholder.test(text)) errors.push(`${field}: write the actual words for this founder, not a description in square brackets. A plan or a table goes in blocks.`)
  }
  if (question && !question.endsWith('?')) errors.push('question: it must be a question and end with a question mark. Put statements in the message.')
  if (replies && replies.length > 0) {
    if (!question) errors.push('replies: give replies only with a question. Add the question or leave the replies out.')
    if (new Set(replies.map((reply) => reply.toLowerCase())).size < replies.length) errors.push('replies: each reply must be different.')
    if (request.view === 'invoice') {
      const founderText = founderTextOf(request)
      const suggested = replies.some((reply) => RAND_AMOUNT.test(reply) && [...amountsIn(reply)].some((cents) => !priceWasGiven(cents, founderText)))
      if (suggested) errors.push('replies: never suggest a price. Prices come only from the founder. Leave out any reply with an amount.')
    }
  }
  return errors
}

// The workspace on screen, from what the request carries.
const viewOf = (request: Pick<ComposeRequest, 'view'> & { workspace?: unknown }): ComposeRequest['view'] | undefined => request.view ?? (request.workspace === undefined ? undefined : 'brand')

// The screen actions of a reply: go back to a workspace that is already open, close the workspaces, or open or export something the library holds. Going
// back and closing need no `opens`, since nothing is being opened, but they can only name what is open. Opening an item from the library does open a
// workspace, so it needs the founder's own words like any other. A reply carries at most one.
export function checkScreenActions(turn: AnyTurn, request: Pick<ComposeRequest, 'view' | 'open' | 'library'> & { workspace?: unknown }): string[] {
  const screen = turn.actions.filter(isScreenAction)
  if (screen.length === 0) return []
  if (screen.length > 1) return ['Use at most one of switch_to, close_workspace, open_item and export_item in a reply.']
  const action = screen[0]
  if (action.type === 'open_item' || action.type === 'export_item') return checkLibraryAction(action, turn, request)
  const here = viewOf(request)
  const open = request.open ?? (here ? [here] : [])
  if (action.type === 'close_workspace') return open.length === 0 ? ['close_workspace: no workspace is open, so there is nothing to close. Leave the action out.'] : []
  const name = WORKSPACE_NAMES[action.workspace]
  if (action.workspace === here) return [`switch_to: the ${name} is already on screen. Leave the action out.`]
  if (!open.includes(action.workspace)) {
    return [`switch_to: the ${name} is not open, and an action cannot open it. If the founder asked for it or agreed to it, open it with opens (their exact words) and no actions. If not, leave the action out.`]
  }
  return []
}

// Opening or exporting something from the library: it must be there, an invoice must be one the founder means, an export must be possible, and opening
// goes on the founder's own words. The action stands alone, and the app does it from what is saved.
function checkLibraryAction(action: Extract<ScreenAction, { type: 'open_item' | 'export_item' }>, turn: AnyTurn, request: Pick<ComposeRequest, 'library'>): string[] {
  const name = action.type
  const errors: string[] = []
  if (turn.actions.length > 1) errors.push(`${name}: it goes on its own. Leave the other actions out.`)
  const library = request.library
  if (action.item === 'brand' && !library?.brand) errors.push(`${name}: no palette is saved, so there is nothing to ${name === 'open_item' ? 'open' : 'export'}. Say so, and offer to build one.`)
  if (action.item === 'ideas' && !library?.ideas) errors.push(`${name}: no board is saved, so there is nothing to ${name === 'open_item' ? 'open' : 'export'}. Say so.`)
  if (action.item !== 'invoice' && action.type === 'open_item' && action.which) errors.push('open_item: which is only for an invoice. Leave it out.')
  if (action.item === 'invoice') {
    const invoices = library?.invoices ?? []
    if (invoices.length === 0) errors.push(`${name}: no invoice is saved. Say so, and offer to make one.`)
    else {
      const found = findInvoice(invoices, action.which)
      if (!found) errors.push(`${name}: "${action.which ?? ''}" is not one of the saved invoices (${invoices.map((invoice) => invoice.number || 'no number').join(', ')}). Ask which they mean, or use the latest if they said "the last one".`)
      else if (action.type === 'export_item' && !found.ready) errors.push(`export_item: invoice ${found.number || '(no number)'} is not ready to export, because required details are missing. Say so, and offer to open it so they can fix it.`)
    }
  }
  if (action.type === 'open_item' && !turn.opens) {
    errors.push('open_item: it opens a workspace, so it needs opens: { because: "asked" or "agreed", quote: the founder\'s exact words from <request> }. If they did not ask to open it, leave the action out.')
  }
  return errors
}

// A reply checked for whichever workspace the request was about: the invoice, the board or the palette. Screen actions are checked on their own, and
// the rest of the reply is checked as if they were not there.
export function checkTurnFor(turn: AnyTurn, request: ComposeRequest): string[] {
  const talk = [...checkConversation(turn, request), ...checkScreenActions(turn, request)]
  const rest = { ...turn, actions: turn.actions.filter((action) => !isScreenAction(action)) } as AnyTurn
  if (request.view === 'board') return [...talk, ...checkBoardTurn(rest as BoardTurn, request.board, founderTextOf(request).join('\n'))]
  // An action for the board has no place on another workspace, or when no workspace is open.
  if (rest.actions.some(isBoardAction)) return [...talk, 'Those actions are for the board, which is not the workspace on screen. Leave them out.']
  if (request.view === 'invoice') return [...talk, ...checkInvoiceTurn(rest as InvoiceTurn, request.invoice, founderTextOf(request))]
  // An action for the invoice has no place on the palette workspace, or when no workspace is open.
  if (rest.actions.some(isInvoiceAction)) return [...talk, 'Those actions are for the invoice, which is not the workspace on screen. Leave them out.']
  return [...talk, ...checkTurn(rest as Turn, request.workspace)]
}
