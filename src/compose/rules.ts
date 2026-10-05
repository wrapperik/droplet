import { openWorkspace } from '../lib/workspaceState.ts'
import { applyTurnActions } from './applyActions.ts'
import { applyBoardTurnActions } from './boardActions.ts'
import { checkBlocks } from './blocks.ts'
import { stateOfBoardSnapshot } from './boardSnapshot.ts'
import type { BoardSnapshot, BoardTurn } from './boardSpec.ts'
import { stateOfSnapshot } from './snapshot.ts'
import { amountsIn, applyInvoiceTurnActions, priceWasGiven } from './invoiceActions.ts'
import type { InvoiceSnapshot } from './invoiceSpec.ts'
import { stateOfInvoiceSnapshot } from './invoiceSnapshot.ts'
import { isBoardAction, isInvoiceAction, type AnyTurn, type ComposeRequest, type InvoiceTurn, type Turn, type WorkspaceSnapshot } from './spec.ts'

// Business rules for a turn, checked in code after the shape is right. The actions are tried against the workspace
// the founder is looking at, through the same code that will apply them, so anything that could not be done is
// caught here, with a reason written to be sent back to the model if it has to try again.

export function checkTurn(turn: Turn, workspace?: WorkspaceSnapshot): string[] {
  if (turn.actions.length === 0) return []

  // Only a brand turn touches the workspace. Anything else is a conversation.
  if (turn.task !== 'brand') {
    return [`Only a brand task may include actions. Leave actions empty for the task "${turn.task}", and put your answer in the message.`]
  }

  const result = applyTurnActions({
    base: workspace ? stateOfSnapshot(workspace) : null,
    open: (blocks) => openWorkspace(blocks),
    actions: turn.actions,
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
  if (turn.actions.length === 0) return []
  if (turn.task !== 'invoice') {
    return [`Only an invoice task may include actions on the invoice. Leave actions empty for the task "${turn.task}", and put your answer in the message.`]
  }
  if (!invoice) return ['There is no invoice open to act on. Leave actions empty.']
  const result = applyInvoiceTurnActions({
    base: stateOfInvoiceSnapshot(invoice),
    actions: turn.actions,
    clients: invoice.savedClients.map((name) => ({ name })),
    founderText,
  })
  return result.skipped.map((skipped) => `Action ${skipped.position + 1} (${skipped.action.type}): ${skipped.reason}`)
}

// The same checks for a reply about the board: the actions are tried against the board the founder is looking at, through the same code that
// will apply them, including where things are to go, which that code finds and the model never gives.
export function checkBoardTurn(turn: BoardTurn, board: BoardSnapshot | undefined): string[] {
  if (turn.actions.length === 0) return []
  if (turn.task !== 'ideation') {
    return [`Only an ideation task may include actions on the board. Leave actions empty for the task "${turn.task}", and put your answer in the message.`]
  }
  if (!board) return ['There is no board open to act on. Leave actions empty.']
  const counter = (() => {
    let n = 0
    return () => `check-${++n}`
  })()
  const result = applyBoardTurnActions({ base: stateOfBoardSnapshot(board), actions: turn.actions, view: board.view, newId: counter })
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

// Opening a workspace is the founder's decision, never Droplet's. A reply that opens one must say the founder asked for it or agreed to it,
// and quote their words, and the quote has to be in what they just wrote. A model that opens a palette because it thinks one would help has
// nothing to quote, so it cannot.
export function checkOpening(turn: AnyTurn, request: Pick<ComposeRequest, 'intent' | 'history' | 'view'> & { workspace?: unknown }): string[] {
  // With no workspace on screen, palette actions are what open the palette. A request that carries the palette's workspace has it on screen.
  const opensPalette = request.view === undefined && request.workspace === undefined && turn.task === 'brand' && turn.actions.some((action) => action.type !== 'undo' && action.type !== 'redo')
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
  if (opens.because === 'agreed' && !request.history?.some((message) => message.role === 'droplet')) {
    errors.push('opens.because: "agreed" needs an earlier offer from you in <conversation>. If there is none, the founder has not agreed to anything yet.')
  }
  return errors
}

// The conversation part of a reply: a question is a question, replies belong to it, and on the invoice a reply never puts a price in the
// founder's mouth. A tapped reply is sent as the founder's own words, so a suggested figure would pass the check that prices come from them.
export function checkConversation(turn: AnyTurn, request: Pick<ComposeRequest, 'intent' | 'history' | 'view'> & { workspace?: unknown }): string[] {
  const errors: string[] = [...checkBlocks(turn.blocks), ...checkOpening(turn, request)]
  const { question, replies } = turn
  // The question is shown after the message, so asking it in both places asks it twice.
  if (question && (plain(turn.message).includes(plain(question)) || turn.message.trim().endsWith('?'))) {
    errors.push('message: do not put your question in the message, or end the message with one. It goes in question only, which is shown after the message.')
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

// A reply checked for whichever workspace the request was about: the invoice, or the palette.
export function checkTurnFor(turn: AnyTurn, request: ComposeRequest): string[] {
  const talk = checkConversation(turn, request)
  if (request.view === 'board') return [...talk, ...checkBoardTurn(turn as BoardTurn, request.board)]
  // An action for the board has no place on another workspace, or when no workspace is open.
  if (turn.actions.some(isBoardAction)) return [...talk, 'Those actions are for the board, which is not the workspace on screen. Leave them out.']
  if (request.view === 'invoice') return [...talk, ...checkInvoiceTurn(turn as InvoiceTurn, request.invoice, founderTextOf(request))]
  // An action for the invoice has no place on the palette workspace, or when no workspace is open.
  if (turn.actions.some(isInvoiceAction)) return [...talk, 'Those actions are for the invoice, which is not the workspace on screen. Leave them out.']
  return [...talk, ...checkTurn(turn as Turn, request.workspace)]
}
