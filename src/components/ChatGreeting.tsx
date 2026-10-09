import { useState } from 'react'
import { firstName, timeGreeting } from '../lib/greeting.ts'
import './ChatGreeting.css'

// The title over a chat with nothing said in it. It is chosen once, when it appears, so it does not change while it is on screen.
export default function ChatGreeting({ name }: { name?: string }) {
  const [text] = useState(() => timeGreeting(new Date(), firstName(name)))
  return <h2 className="chat-greeting">{text}</h2>
}
