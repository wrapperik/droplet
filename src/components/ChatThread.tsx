import { Fragment, useEffect, useRef } from 'react'
import DropletLoader from './DropletLoader.tsx'
import RichText from './RichText.tsx'
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
  // The one question Droplet asks next, set apart from the answer above it.
  question?: string
  // Answers to that question the founder can tap instead of typing. Offered only while the message is the last in the thread.
  replies?: string[]
  // Buttons under the message, while its question is still open.
  actions?: ThreadAction[]
  // A note from the app, not an answer from the model, so it is not sent to the model as part of the conversation.
  local?: boolean
}

type Props = {
  messages: ThreadMessage[]
  // A button on a message was pressed.
  onAction?: (messageId: number, actionId: string) => void
  // A suggested reply was tapped. It is sent as the founder's own message.
  onReply?: (text: string) => void
}

// The running conversation. It scrolls on its own, and follows the newest message.
export default function ChatThread({ messages, onAction, onReply }: Props) {
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
            <li className={`thread__message thread__message--${message.from}${message.pending ? ' thread__message--pending' : ''}`}>
              <span className="visually-hidden">{message.from === 'you' ? 'You: ' : 'Droplet: '}</span>
              {message.pending ? (
                <span className="thread__pending">
                  <DropletLoader />
                  Thinking
                </span>
              ) : message.from === 'droplet' ? (
                <RichText source={message.text} />
              ) : (
                message.text
              )}
              {!message.pending && message.question && <p className="thread__question">{message.question}</p>}
              {message.actions && message.actions.length > 0 && (
                <span className="thread__actions">
                  {message.actions.map((action) => (
                    <button key={action.id} type="button" className={action.primary ? 'thread__action thread__action--primary' : 'thread__action'} onClick={() => onAction?.(message.id, action.id)}>
                      {action.label}
                    </button>
                  ))}
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
    </ol>
  )
}
