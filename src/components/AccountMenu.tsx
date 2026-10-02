import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AltArrowUpIcon, Logout2Icon, UserCircleIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import './AccountMenu.css'

type Props = {
  name: string
  // The sidebar is icons only, so just the avatar shows and the name moves into the button's label.
  collapsed?: boolean
  onAccount?: () => void
  onSignOut?: () => void
}

// The account section at the bottom of the sidebar: who is signed in, and a menu for the account page and signing out.
export default function AccountMenu({ name, collapsed = false, onAccount, onSignOut }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, wrapRef)

  const choose = (action?: () => void) => () => {
    setOpen(false)
    action?.()
  }

  return (
    <div className="account" ref={wrapRef}>
      <AnimatePresence>
        {open && (
          <motion.div
            className="account__menu glass glass--strong"
            role="menu"
            aria-label="Account"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <button type="button" role="menuitem" className="account__item" onClick={choose(onAccount)}>
              <UserCircleIcon size={20} aria-hidden="true" />
              Account
            </button>
            <hr className="account__divider" />
            <button type="button" role="menuitem" className="account__item" onClick={choose(onSignOut)}>
              <Logout2Icon size={20} aria-hidden="true" />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        className="account__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? `Account, ${name}` : undefined}
        title={collapsed ? name : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account__avatar" aria-hidden="true">
          {name.charAt(0)}
        </span>
        <span className="account__name">{name}</span>
        <AltArrowUpIcon className="account__chevron" size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
