import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckIcon, CopyIcon, DocumentIcon, FileTextIcon, GalleryIcon, PenIcon, RestartIcon } from '@solar-icons/react/linear'
import type { ChatBlock } from '../compose/blocks.ts'
import type { JourneyStep } from '../compose/journey.ts'
import type { Grounding } from '../compose/grounding.ts'
import type { Receipt } from '../compose/receipt.ts'
import type { AttachmentNote } from '../compose/attachments.ts'
import type { Used } from '../compose/used.ts'
import UsedLine from './UsedLine.tsx'
import type { InvoiceResult } from '../lib/invoiceGuide.ts'
import type { SpecColour } from '../lib/logoHandoff.ts'
import ChangeReceipt from './ChangeReceipt.tsx'
import FactChips, { type ProposalView } from './FactChips.tsx'
import type { FactKey } from '../lib/facts.ts'
import ChatBlocks from './ChatBlocks.tsx'
import WebSources from './WebSources.tsx'
// Older thinking indicators are kept: the jelly blobs in JellyLoader.tsx, the rippling mark in DropletLoader.tsx and the four pulsing circles in
// ThinkingDots.tsx. To bring one back, import it here and swap it for DiamondLoader below.
// import DropletLoader from './DropletLoader.tsx'
// import ThinkingDots from './ThinkingDots.tsx'
import DiamondLoader from './DiamondLoader.tsx'
// A sent message used to be carried from the bar by a copy drawn over the screen (FlyingMessage); it now rises into place on its own (`data-rising`).
// To bring the copy back, import FlyingMessage here and draw it at the end of the list, as the commit that replaced it shows.
import type { FlightOrigin } from './FlyingMessage.tsx'
import RichText from './RichText.tsx'
import { parseRichText } from '../lib/richText.ts'
import { whenLabel } from '../lib/chatStore.ts'
import './ChatThread.css'

// A button on a message, for something Droplet asks the founder to decide, such as saving before leaving.
export type ThreadAction = { id: string; label: string; primary?: boolean }

export type ThreadMessage = {
  id: number
  // A divider is a line across the thread with a few words on it, such as where the founder moved to. It is not part of the
  // conversation, so it is never sent to the composer.
  from: 'you' | 'droplet' | 'divider'
  text: string
  // Droplet is still working on this reply.
  pending?: boolean
  // Files the founder attached to this message: their names and kinds, kept with the message. What was in them is never kept.
  attachments?: AttachmentNote[]
  // A table or a checklist shown under the words, drawn by the interface from data.
  blocks?: ChatBlock[]
  // The ticks the founder made on a checklist, by `block:item`, kept with the message.
  checks?: Record<string, boolean>
  // The one question Droplet asks next, set apart from the answer above it.
  question?: string
  // What the reply searched the web for and drew on. Shown under it, with Google's suggestions, whenever the reply is shown.
  grounding?: Grounding
  // What the reply changed on screen and what it left out, drawn under it. Kept with the message in the saved chat.
  receipt?: Receipt
  // The reply was made in this session, so what it changed can still be undone and shown. Not kept: after a reload there are only the lines.
  receiptLive?: { undo: boolean; show: boolean }
  // What Droplet was given to make this reply, in the app's words: a quiet line under it that opens into a list. Built from the request that was sent.
  used?: Used
  // Facts Droplet offers to remember, drawn under the reply. Only for the session: they mean nothing in a chat opened later.
  proposals?: ProposalView[]
  // Answers to that question the founder can tap instead of typing. Offered only while the message is the last in the thread.
  replies?: string[]
  // Buttons under the message, while its question is still open.
  actions?: ThreadAction[]
  // A note from the app, not an answer from the model, so it is not sent to the model as part of the conversation.
  local?: boolean
  // A task finished in Guide mode, shown as a card under the words: for now, an invoice.
  result?: InvoiceResult
  // When it was sent or arrived (ISO), shown under it on hover or focus.
  at?: string
  // The reply has only just arrived, so it comes in paragraph by paragraph, then its blocks, its question and its suggested replies. Home clears this
  // a moment later, so a thread mounted again (the chat moving into the side panel) does not play it a second time. Not kept with the chat.
  fresh?: boolean
}

type Props = {
  messages: ThreadMessage[]
  // A button on a message was pressed.
  onAction?: (messageId: number, actionId: string) => void
  // A suggested reply was tapped. It is sent as the founder's own message.
  onReply?: (text: string) => void
  // The steps the project shows are done, so a plan can tick them.
  done?: ReadonlySet<JourneyStep>
  // Droplet is working, so a button that would ask it something waits.
  busy?: boolean
  // A box on a checklist was ticked or cleared.
  onToggle?: (messageId: number, block: number, item: number, checked: boolean) => void
  // A plan step's Open button was pressed.
  onOpenStep?: (step: JourneyStep) => void
  // Undo this, or Show me, was pressed on a change receipt.
  onUndoReceipt?: (messageId: number) => void
  onShowReceipt?: (messageId: number) => void
  // Remember, or Not now, was pressed on a fact Droplet offered.
  onRememberFact?: (messageId: number, key: FactKey) => void
  onDismissFact?: (messageId: number, key: FactKey) => void
  // The message the founder just sent: it rises from the bottom into its place (`data-rising`, see ChatThread.css); Home clears it a moment
  // after. `from` is where the bar was, kept for the copy that used to fly from it. `onFlightEnd` was for that copy and is not called now.
  flight?: { id: number; from?: FlightOrigin } | null
  onFlightEnd?: () => void
  // Draws the card of a finished task. The thread does not know how to export or open one, so whoever holds the project draws it.
  renderResult?: (message: ThreadMessage) => ReactNode
  // What a logo brief in the chat is drawn from: the name, the saved palette's colours and the fonts the founder chose. From the project, not the model.
  brand?: { name: string; colours: SpecColour[]; fontsFact?: string }
  // The brief's button for the logo handoff card.
  onOpenHandoff?: () => void
  // What Droplet is doing while a reply is pending: the stage in words, and the seconds so far (shown after a few). Absent, the pending message says "Thinking".
  progress?: { words: string; elapsed: string } | null
  // Stop was pressed on a reply still being worked on. The request is given up and nothing is applied.
  onStop?: () => void
  // Try again was pressed on Droplet's last reply, or the founder edited their last message and sent it again. Home takes both back and asks again.
  onRetry?: (messageId: number) => void
  onEdit?: (messageId: number, text: string) => void
}

const NO_STEPS: ReadonlySet<JourneyStep> = new Set()

// The running conversation. It scrolls on its own, and follows the newest message.
export default function ChatThread({ messages, onAction, onReply, done = NO_STEPS, busy, onToggle, onOpenStep, onUndoReceipt, onShowReceipt, onRememberFact, onDismissFact, flight, renderResult, brand, onOpenHandoff, progress, onStop, onRetry, onEdit }: Props) {
  const listRef = useRef<HTMLOListElement>(null)
  // The founder's message being edited, and what it says now.
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null)

  // Follow the newest message, including when a reply that was pending arrives in place and is taller than "Thinking".
  const last = messages[messages.length - 1]
  const lastKey = last ? `${last.id}:${last.pending ? 'pending' : 'done'}:${last.text.length}:${last.question?.length ?? 0}` : ''
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollTo?.({ top: list.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [messages.length, lastKey])

  // The last exchange can be tried again or edited, when it was a plain conversation: a reply that changed a workspace has its own Undo this, and one
  // with buttons or a card is the app's question. Only while nothing is being worked on.
  const lastIndex = messages.length - 1
  const lastReply = messages[lastIndex]
  // A message that had files cannot be sent again: they are not kept.
  const hadFiles = (messages[lastIndex - 1]?.attachments?.length ?? 0) > 0
  const again = !busy && !hadFiles && lastReply?.from === 'droplet' && !lastReply.pending && !lastReply.local && !lastReply.receipt && !lastReply.result && !(lastReply.actions && lastReply.actions.length > 0)
  const askedBy = again && messages[lastIndex - 1]?.from === 'you' ? messages[lastIndex - 1] : undefined

  return (
    <ol ref={listRef} className="thread" role="log" aria-label="Conversation" aria-live="polite" tabIndex={0}>
      {messages.map((message, index) => {
        if (message.from === 'divider') {
          return (
            <li key={message.id} className="thread__divider">
              <span>{message.text}</span>
            </li>
          )
        }
        // Only the newest message offers replies: once the conversation moves on, they would answer a question that is no longer open.
        // A reply that has only just arrived comes in a piece at a time: its paragraphs, then its blocks, receipt, question and suggested replies.
        const fresh = message.fresh === true && message.from === 'droplet'
        const base = fresh ? parseRichText(message.text).length : 0
        const at = (step: number) => (fresh ? ({ 'data-reveal': '', style: { '--i': base + step } as React.CSSProperties } as const) : {})
        const replies = index === messages.length - 1 && message.from === 'droplet' && !message.pending && message.question ? (message.replies ?? []) : []
        return (
          <Fragment key={message.id}>
            <li
              className={`thread__message thread__message--${message.from}${message.pending ? ' thread__message--pending' : ''}`}
              data-message-id={message.id}
              data-rising={flight?.id === message.id ? '' : undefined}
            >
              <span className="visually-hidden">{message.from === 'you' ? 'You: ' : 'Droplet: '}</span>
              {message.pending ? (
                <span className="thread__pending">
                  {/* <DropletLoader /> */}
                  {/* <ThinkingDots /> */}
                  <span className="thread__pending-text">{progress?.words ?? 'Thinking'}</span>
                  {/* The seconds are drawn but not read out: the log is a live region, and it would announce the time every second. */}
                  {progress?.elapsed && <span className="thread__elapsed" aria-hidden="true"> · {progress.elapsed}</span>}
                  {/* The loader follows the words on the same line, so the line starts where the reply will, and reads as the reply being written. */}
                  <DiamondLoader />
                  {onStop && (
                    <button type="button" className="thread__stop" onClick={onStop}>
                      Stop
                    </button>
                  )}
                </span>
              ) : message.from === 'droplet' ? (
                <RichText source={message.text} reveal={fresh} />
              ) : editing?.id === message.id ? (
                <form
                  className="thread__edit"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const text = editing.text.trim()
                    if (text === '') return
                    setEditing(null)
                    onEdit?.(message.id, text)
                  }}
                >
                  <textarea
                    className="thread__edit-field"
                    aria-label="Edit your message"
                    value={editing.text}
                    rows={2}
                    maxLength={600}
                    autoFocus
                    onChange={(event) => setEditing({ id: message.id, text: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditing(null)
                      else if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        event.currentTarget.form?.requestSubmit()
                      }
                    }}
                  />
                  <span className="thread__edit-buttons">
                    <button type="submit" className="thread__action thread__action--primary" disabled={editing.text.trim() === ''}>
                      Send again
                    </button>
                    <button type="button" className="thread__action" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </span>
                </form>
              ) : (
                message.text
              )}
              {message.from === 'you' && message.attachments && message.attachments.length > 0 && (
                <ul className="thread__files" aria-label="Attached files">
                  {message.attachments.map((file, at) => (
                    <li key={at} className="thread__file">
                      {file.kind === 'image' ? <GalleryIcon size={14} aria-hidden="true" /> : file.kind === 'pdf' ? <DocumentIcon size={14} aria-hidden="true" /> : <FileTextIcon size={14} aria-hidden="true" />}
                      <span>{file.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!message.pending && message.result && renderResult?.(message)}
              {!message.pending && message.blocks && message.blocks.length > 0 && (
                <div {...at(0)}>
                <ChatBlocks blocks={message.blocks} checks={message.checks} done={done} busy={busy} onToggle={(block, item, checked) => onToggle?.(message.id, block, item, checked)} onOpen={onOpenStep} brand={brand} onOpenHandoff={onOpenHandoff} />
                </div>
              )}
              {!message.pending && message.receipt && (
                <div {...at(1)}>
                <ChangeReceipt
                  receipt={message.receipt}
                  canUndo={message.receiptLive?.undo}
                  canShow={message.receiptLive?.show}
                  busy={busy}
                  onUndo={() => onUndoReceipt?.(message.id)}
                  onShow={() => onShowReceipt?.(message.id)}
                />
                </div>
              )}
              {!message.pending && message.proposals && message.proposals.length > 0 && (
                <FactChips proposals={message.proposals} onRemember={(key) => onRememberFact?.(message.id, key)} onNotNow={(key) => onDismissFact?.(message.id, key)} />
              )}
              {!message.pending && message.question && (
                <p className="thread__question" {...at(2)}>
                  {message.question}
                </p>
              )}
              {!message.pending && message.grounding && <WebSources grounding={message.grounding} />}
              {!message.pending && message.from === 'droplet' && message.used && !message.local && <UsedLine used={message.used} />}
              {message.actions && message.actions.length > 0 && (
                <span className="thread__actions">
                  {message.actions.map((action) => (
                    <button key={action.id} type="button" className={action.primary ? 'thread__action thread__action--primary' : 'thread__action'} onClick={() => onAction?.(message.id, action.id)}>
                      {action.label}
                    </button>
                  ))}
                </span>
              )}
              {!message.pending && (message.at || message.from === 'droplet') && (
                <span className="thread__meta">
                  {message.at && whenLabel(message.at) && (
                    <time className="thread__time" dateTime={message.at}>
                      {whenLabel(message.at)}
                    </time>
                  )}
                  {message.from === 'droplet' && <CopyButton text={[message.text, message.question].filter(Boolean).join('\n\n')} />}
                  {message.id === lastReply?.id && again && onRetry && (
                    <button type="button" className="thread__copy" aria-label="Try again" title="Try again" onClick={() => onRetry(message.id)}>
                      <RestartIcon size={14} aria-hidden="true" />
                    </button>
                  )}
                  {message.id === askedBy?.id && onEdit && editing?.id !== message.id && (
                    <button type="button" className="thread__copy" aria-label="Edit your message" title="Edit" onClick={() => setEditing({ id: message.id, text: message.text })}>
                      <PenIcon size={14} aria-hidden="true" />
                    </button>
                  )}
                </span>
              )}
            </li>
            {replies.length > 0 && (
              <li className="thread__replies" {...(fresh || lastReply?.fresh ? ({ 'data-reveal': '', style: { '--i': (lastReply?.fresh ? parseRichText(lastReply.text).length : 0) + 3 } as React.CSSProperties } as const) : {})}>
                <ul aria-label="Suggested replies">
                  {replies.map((reply) => (
                    <li key={reply}>
                      <button type="button" className="thread__reply" onClick={() => onReply?.(reply)}>
                        {reply}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}

// Copies a reply's words (and its question) as plain text. Says "Copied" for a moment, aloud as well.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className="thread__copy"
      aria-label={copied ? 'Copied' : 'Copy reply'}
      title={copied ? 'Copied' : 'Copy'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
        } catch {
          setCopied(false)
        }
      }}
    >
      {copied ? <CheckIcon size={14} aria-hidden="true" /> : <CopyIcon size={14} aria-hidden="true" />}
    </button>
  )
}
