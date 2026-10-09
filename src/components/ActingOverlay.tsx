import { AnimatePresence, motion } from 'framer-motion'
import './ActingOverlay.css'

type Props = {
  // Droplet is changing the workspace on screen: what it does lands when this ends.
  active: boolean
}

// Shown only while Droplet is acting on the workspace, never while it is only thinking or talking: the screen behind goes soft and a grid of
// nine squares lights up one after another (adapted from JkHuger on Uiverse.io). It takes presses while it is there, so nothing is changed
// under it, and goes as the changes land. The words in the chat say what is happening, so it is decoration. With reduced motion the squares hold still.
export default function ActingOverlay({ active }: Props) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="acting"
          className="acting"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <span className="acting__loader">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} className={`acting__square acting__square--${index + 1}`} />
            ))}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
