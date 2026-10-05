import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import type { ProjectSummary } from '../lib/mockProjects.ts'
import { FIRST_PROJECT_NAME } from '../lib/onboarding.ts'
import { createProject, listProjects } from '../lib/projectsStore.ts'
import { useAuth } from '../store/auth.ts'
import Home from './Home.tsx'

export { FIRST_PROJECT_NAME }

type Loaded = { userId: string; projects: ProjectSummary[] } | 'failed' | null

// The app for the signed-in founder. A founder who has not been through the introduction goes there first. Otherwise it reads their projects
// (making the first one, if they have none yet) before Home opens, so Home always has a project to work in, and it is theirs. Another
// founder on the same browser gets their own, never the last one's.
export default function HomeRoute() {
  const user = useAuth((state) => state.user)
  const signOut = useAuth((state) => state.signOut)
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState<Loaded>(null)
  const [attempt, setAttempt] = useState(0)
  const userId = user?.id ?? ''
  const introduced = user?.onboarded ?? false

  useEffect(() => {
    // Not before the introduction, which is where the first project gets its name.
    if (!introduced) return
    let wanted = true
    ;(async () => {
      let projects = await listProjects()
      if (projects && projects.length === 0) {
        const first = await createProject(FIRST_PROJECT_NAME)
        projects = first ? [first] : null
      }
      if (wanted) setLoaded(projects ? { userId, projects } : 'failed')
    })()
    return () => {
      wanted = false
    }
  }, [userId, attempt, introduced])

  const leave = useCallback(async () => {
    await signOut()
    navigate('/sign-in', { replace: true })
  }, [navigate, signOut])

  if (user && !user.onboarded) return <Navigate to="/welcome" replace />

  if (loaded === 'failed') {
    return (
      <main className="auth-loading" role="alert">
        <p>We could not load your projects.</p>
        <button
          type="button"
          onClick={() => {
            setLoaded(null)
            setAttempt((count) => count + 1)
          }}
        >
          Try again
        </button>
      </main>
    )
  }
  // Until the projects of the person who is signed in now have arrived.
  if (!loaded || loaded.userId !== userId) return <div className="auth-loading" role="status" aria-label="Loading your projects" />
  return <Home key={userId} projects={loaded.projects} userName={user?.name} onSignOut={leave} />
}
