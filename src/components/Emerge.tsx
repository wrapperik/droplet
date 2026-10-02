import { useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

type Props = {
  children: ReactNode
  // Seconds before this part starts to appear. Stagger parts so they arrive one after another.
  delay?: number
  // How far away it starts, from 0 (right here) to 1 (far off). A farther start is smaller and blurrier.
  distance?: number
  className?: string
}

// Arrives blurred and small, then eases forward into focus. With reduced motion it only fades in.
export default function Emerge({ children, delay = 0, distance = 0.5, className }: Props) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, scale: 1 - 0.3 * distance, y: 56 * distance, filter: `blur(${Math.round(8 + 34 * distance)}px)` }
      }
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.95, delay: reduceMotion ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
      // A filter, even blur(0px), makes everything inside render without its backdrop blur and
      // blurs text slightly. Remove it once the part has arrived.
      onAnimationComplete={() => {
        if (ref.current) ref.current.style.filter = 'none'
      }}
    >
      {children}
    </motion.div>
  )
}
