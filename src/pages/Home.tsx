import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HamburgerMenuIcon } from '@solar-icons/react/linear'
import AccountMenu from '../components/AccountMenu.tsx'
import ChatThread, { type ThreadMessage } from '../components/ChatThread.tsx'
import IntentBar from '../components/IntentBar.tsx'
import PaletteWorkspace from '../components/PaletteWorkspace.tsx'
import Sidebar from '../components/Sidebar.tsx'
import Wordmark from '../components/Wordmark.tsx'
import { mockProjects, mockUser } from '../lib/mockProjects.ts'
import { isColourPaletteIntent } from '../lib/testIntents.ts'
import './Home.css'

const PALETTE_REPLY =
  'I assembled a colour palette workspace: a colour picker, a contrast checker and a canvas of four blocks. Drag any of them by the grip on its top edge to rearrange.'
const NO_WORKSPACE_REPLY = 'I cannot assemble a workspace for that yet. Try asking for a colour palette, or choose a task from the menu.'

export default function Home() {
  const [currentProjectId, setCurrentProjectId] = useState(mockProjects[0].id)
  const [activeId, setActiveId] = useState('home')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  // Once a workspace has been assembled the intent bar moves to a side panel, beside a thread that can scroll.
  const [docked, setDocked] = useState(false)
  const [thread, setThread] = useState<ThreadMessage[]>([])
  const nextMessageId = useRef(1)

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  const submitIntent = useCallback((text: string) => {
    const matched = isColourPaletteIntent(text)
    const message = (from: ThreadMessage['from'], body: string): ThreadMessage => ({ id: nextMessageId.current++, from, text: body })
    setThread((current) => [...current, message('you', text), message('droplet', matched ? PALETTE_REPLY : NO_WORKSPACE_REPLY)])
    if (matched) {
      setShowPicker(true)
      // The side panel takes width, so the sidebar steps back to icons the first time. It can be opened again.
      if (!docked) setCollapsed(true)
      setDocked(true)
    }
  }, [docked])

  const navigate = (id: string) => {
    setActiveId(id)
    setMobileOpen(false)
  }

  return (
    <div className={docked ? 'home home--docked' : 'home'}>
      <Sidebar
        projects={mockProjects}
        currentProjectId={currentProjectId}
        onSelectProject={setCurrentProjectId}
        activeId={activeId}
        onNavigate={navigate}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
      />
      {mobileOpen && <div className="home__scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      <div className="home__screen glass glass--strong">
        <header className="home__header">
          <div className="home__menu">
            <button
              type="button"
              className="home__menu-button"
              aria-label="Open sidebar"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <HamburgerMenuIcon size={22} aria-hidden="true" />
            </button>
          </div>
          <div className="home__brand">
            <Wordmark />
          </div>
          <div className="home__account">
            <AccountMenu name={mockUser.name} />
          </div>
        </header>

        <main className="home__canvas">
          <h1 className="visually-hidden">Home</h1>
          <AnimatePresence>
            {showPicker && (
              <motion.div key="palette" className="home__component" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                <PaletteWorkspace
                  key={currentProjectId}
                  projectId={currentProjectId}
                  projectName={mockProjects.find((project) => project.id === currentProjectId)?.name ?? ''}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {!docked && (
          <footer className="home__footer">
            <IntentBar onSubmitIntent={submitIntent} />
          </footer>
        )}
      </div>

      {docked && (
        <motion.aside
          className="home__chat"
          aria-label="Conversation"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <ChatThread messages={thread} />
          <IntentBar docked onSubmitIntent={submitIntent} />
        </motion.aside>
      )}
    </div>
  )
}
