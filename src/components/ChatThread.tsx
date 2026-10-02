import { useEffect, useRef } from 'react'
import './ChatThread.css'

export type ThreadMessage = {
  id: number
  from: 'you' | 'droplet'
  text: string
}

type Props = {
  messages: ThreadMessage[]
}

// The running conversation. It scrolls on its own, and follows the newest message.
export default function ChatThread({ messages }: Props) {
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollTo?.({ top: list.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [messages.length])

  return (
    <ol ref={listRef} className="thread" role="log" aria-label="Conversation" aria-live="polite" tabIndex={0}>
      {messages.map((message) => (
        <li key={message.id} className={`thread__message thread__message--${message.from}`}>
          <span className="visually-hidden">{message.from === 'you' ? 'You: ' : 'Droplet: '}</span>
          {message.text}
        </li>
      ))}
    </ol>
  )
}
