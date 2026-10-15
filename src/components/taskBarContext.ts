import { createContext, useContext } from 'react'

// The id of the tooltip of the task bar item being drawn, for a tool's own control to point `aria-describedby` at.
export const TipContext = createContext<string | undefined>(undefined)
export const useBarTip = () => useContext(TipContext)
