import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HamburgerMenuIcon } from '@solar-icons/react/linear'
import AccountMenu from '../components/AccountMenu.tsx'
import IntentBar from '../components/IntentBar.tsx'
import PaletteWorkspace from '../components/PaletteWorkspace.tsx'
import Sidebar from '../components/Sidebar.tsx'
import Wordmark from '../components/Wordmark.tsx'
import { mockProjects, mockUser } from '../lib/mockProjects.ts'
import { isColourPaletteIntent } from '../lib/testIntents.ts'
import './Home.css'

export default function Home() {
  const [currentProjectId, setCurrentProjectId] = useState(mockProjects[0].id)
  const [activeId, setActiveId] = useState('home')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  const navigate = (id: string) => {
    setActiveId(id)
    setMobileOpen(false)
  }

  return (
    <div className="home">
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

        <footer className="home__footer">
          <IntentBar onSubmitIntent={(text) => setShowPicker(isColourPaletteIntent(text))} />
        </footer>
      </div>
    </div>
  )
}
