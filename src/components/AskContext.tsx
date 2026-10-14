import { createContext, useContext } from 'react'

// What lets a control deep in a workspace ask Droplet something in the founder's name: the same send that the message bar uses, so the question lands in
// the chat and the reply comes with its change receipt like any other. Home provides it. Outside Home (a workspace on its own, a test) there is none,
// and the controls that need it draw nothing.
export type Ask = {
  // Sends a message as the founder's own.
  ask: (text: string) => void
  // Droplet is working on a reply, so another cannot be sent yet.
  busy: boolean
}

export const AskContext = createContext<Ask | null>(null)

export const useAsk = () => useContext(AskContext)
