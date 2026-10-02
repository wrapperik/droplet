import { useState } from 'react'
import AccountMenu from '../components/AccountMenu.tsx'
import IntentBar from '../components/IntentBar.tsx'
import ProjectRail from '../components/ProjectRail.tsx'
import Wordmark from '../components/Wordmark.tsx'
import { mockProjects, mockUser } from '../lib/mockProjects.ts'
import './Home.css'

export default function Home() {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)

  return (
    <div className="home">
      <header className="home__header">
        <div className="home__brand">
          <Wordmark />
        </div>
        <div className="home__account">
          <AccountMenu name={mockUser.name} />
        </div>
      </header>

      <main className="home__main">
        <h1 className="visually-hidden">Home</h1>
        <ProjectRail projects={mockProjects} currentId={currentProjectId} onSelect={setCurrentProjectId} />
        <section className="home__canvas" aria-label="Workspace" />
      </main>

      <footer className="home__footer">
        <IntentBar />
      </footer>
    </div>
  )
}
