import type { ReactNode, Ref } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  // The part on screen. A change of part is a change of card: the old one leaves, then the new one arrives.
  stepKey: string
  cardRef: Ref<HTMLDivElement>
  // "Step 2 of 3".
  position: number
  of: number
  children: ReactNode
}

// The one part of a task that Guide mode shows at a time, with its "Step n of m" line above it. The same for every task.
export default function GuideCard({ stepKey, cardRef, position, of, children }: Props) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stepKey}
        ref={cardRef}
        tabIndex={-1}
        className="guide__card"
        initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <p className="guide__count">{`Step ${position} of ${of}`}</p>
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
