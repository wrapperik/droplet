import { Fragment, useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon } from '@solar-icons/react/linear'
import type { ChatBlock } from '../compose/blocks.ts'
import type { JourneyStep } from '../compose/journey.ts'
import type { Grounding } from '../compose/grounding.ts'
import type { Receipt } from '../compose/receipt.ts'
import ChangeReceipt from './ChangeReceipt.tsx'
import FactChips, { type ProposalView } from './FactChips.tsx'
import type { FactKey } from '../lib/facts.ts'
import ChatBlocks from './ChatBlocks.tsx'
import WebSources from './WebSources.tsx'
// Older thinking indicators are kept: the rippling mark in DropletLoader.tsx and the four pulsing circles in ThinkingDots.tsx.
// To bring one back, import it here and swap it for JellyLoader below.
// import DropletLoader from './DropletLoader.tsx'
// import ThinkingDots from './ThinkingDots.tsx'
import JellyLoader from './JellyLoader.tsx'
import FlyingMessage, { type FlightOrigin } from './FlyingMessage.tsx'
import RichText from './RichText.tsx'
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
  // Facts Droplet offers to remember, drawn under the reply. Only for the session: they mean nothing in a chat opened later.
  proposals?: ProposalView[]
  // Answers to that question the founder can tap instead of typing. Offered only while the message is the last in the thread.
  replies?: string[]
  // Buttons under the message, while its question is still open.
  actions?: ThreadAction[]
  // A note from the app, not an answer from the model, so it is not sent to the model as part of the conversation.
  local?: boolean
  // When it was sent or arrived (ISO), shown under it on hover or focus.
  at?: string
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
  // A message the founder just sent is on its way from the bar to its place here: the shape that carries it is drawn over the screen, and the
  // message itself is there but not shown until it arrives. `onFlightEnd` says it has.
  flight?: { id: number; from: FlightOrigin } | null
  onFlightEnd?: () => void
}

const NO_STEPS: ReadonlySet<JourneyStep> = new Set()

// The running conversation. It scrolls on its own, and follows the newest message.
export default function ChatThread({ messages, onAction, onReply, done = NO_STEPS, busy, onToggle, onOpenStep, onUndoReceipt, onShowReceipt, onRememberFact, onDismissFact, flight, onFlightEnd }: Props) {
  const listRef = useRef<HTMLOListElement>(null)

  // Follow the newest message, including when a reply that was pending arrives in place and is taller than "Thinking".
  const last = messages[messages.length - 1]
  const lastKey = last ? `${last.id}:${last.pending ? 'pending' : 'done'}:${last.text.length}:${last.question?.length ?? 0}` : ''
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollTo?.({ top: list.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [messages.length, lastKey])

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
        const replies = index === messages.length - 1 && message.from === 'droplet' && !message.pending && message.question ? (message.replies ?? []) : []
        return (
          <Fragment key={message.id}>
            <li
              className={`thread__message thread__message--${message.from}${message.from === 'you' ? ' glass' : ''}${message.pending ? ' thread__message--pending' : ''}`}
              data-message-id={message.id}
              data-flying={flight?.id === message.id ? '' : undefined}
            >
              <span className="visually-hidden">{message.from === 'you' ? 'You: ' : 'Droplet: '}</span>
              {message.pending ? (
                <span className="thread__pending">
                  {/* <DropletLoader /> */}
                  {/* <ThinkingDots /> */}
                  <JellyLoader />
                  Thinking
                </span>
              ) : message.from === 'droplet' ? (
                <RichText source={message.text} />
              ) : (
                message.text
              )}
              {!message.pending && message.blocks && message.blocks.length > 0 && (
                <ChatBlocks blocks={message.blocks} checks={message.checks} done={done} busy={busy} onToggle={(block, item, checked) => onToggle?.(message.id, block, item, checked)} onOpen={onOpenStep} />
              )}
              {!message.pending && message.receipt && (
                <ChangeReceipt
                  receipt={message.receipt}
                  canUndo={message.receiptLive?.undo}
                  canShow={message.receiptLive?.show}
                  busy={busy}
                  onUndo={() => onUndoReceipt?.(message.id)}
                  onShow={() => onShowReceipt?.(message.id)}
                />
              )}
              {!message.pending && message.proposals && message.proposals.length > 0 && (
                <FactChips proposals={message.proposals} onRemember={(key) => onRememberFact?.(message.id, key)} onNotNow={(key) => onDismissFact?.(message.id, key)} />
              )}
              {!message.pending && message.question && <p className="thread__question">{message.question}</p>}
              {!message.pending && message.grounding && <WebSources grounding={message.grounding} />}
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
                </span>
              )}
            </li>
            {replies.length > 0 && (
              <li className="thread__replies">
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
      {flight && messages.some((message) => message.id === flight.id) && (
        <FlyingMessage messageId={flight.id} text={messages.find((message) => message.id === flight.id)?.text ?? ''} from={flight.from} onEnd={() => onFlightEnd?.()} />
      )}
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
