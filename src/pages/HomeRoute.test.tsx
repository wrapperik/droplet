import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary } from '../lib/mockProjects.ts'
import { useAuth } from '../store/auth.ts'

// Home itself is large and has its own tests: here it is a stand-in that shows what it was given.
vi.mock('./Home.tsx', () => ({
  default: ({
    projects,
    userName,
    onAccount,
    onSignOut,
    onCreateProject,
    onRenameProject,
  }: {
    projects: ProjectSummary[]
    userName: string
    onAccount: () => void
    onSignOut: () => void
    onCreateProject: (name: string) => Promise<ProjectSummary | null>
    onRenameProject: (id: string, name: string) => Promise<ProjectSummary | null>
  }) => (
    <div>
      <button type="button" onClick={() => void onCreateProject('Pet sitting').then((made) => (document.title = made ? `made ${made.id}` : 'not made'))}>
        Make a project
      </button>
      <button type="button" onClick={() => void onRenameProject('p1', 'Kindred Gifts').then((done) => (document.title = done ? 'renamed' : 'not renamed'))}>
        Rename a project
      </button>
      <p>Projects: {projects.map((project) => project.name).join(', ')}</p>
      <p>User: {userName}</p>
      <button type="button" onClick={onAccount}>
        Account now
      </button>
      <button type="button" onClick={onSignOut}>
        Sign out now
      </button>
    </div>
  ),
}))

const store = { listProjects: vi.fn(), createProject: vi.fn(), renameProject: vi.fn() }
vi.mock('../lib/projectsStore.ts', () => ({
  listProjects: () => store.listProjects(),
  createProject: (name: string) => store.createProject(name),
  renameProject: (id: string, name: string) => store.renameProject(id, name),
}))

import HomeRoute, { FIRST_PROJECT_NAME } from './HomeRoute.tsx'

const signOut = vi.fn(async () => {})
beforeEach(() => {
  store.listProjects.mockReset()
  store.createProject.mockReset()
  store.renameProject.mockReset()
  signOut.mockClear()
  useAuth.setState({ status: 'signedIn', user: { id: 'u1', email: 'm@example.com', name: 'Megan', onboarded: true }, signOut })
})
afterEach(() => useAuth.setState({ status: 'loading', user: null }))

const renderRoute = () =>
  render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route path="/home" element={<HomeRoute />} />
        <Route path="/sign-in" element={<p>Sign in here</p>} />
        <Route path="/welcome" element={<p>The introduction</p>} />
        <Route path="/account" element={<p>The account page</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('HomeRoute', () => {
  it('shows nothing of Home until the founder\'s projects have arrived, then gives Home their projects and name', async () => {
    store.listProjects.mockResolvedValue([{ id: 'p1', name: 'Kindred Gifting' }, { id: 'p2', name: 'Pet sitting' }])
    renderRoute()
    expect(screen.getByRole('status', { name: 'Loading your projects' })).toBeInTheDocument()
    expect(await screen.findByText('Projects: Kindred Gifting, Pet sitting')).toBeInTheDocument()
    expect(screen.getByText('User: Megan')).toBeInTheDocument()
    expect(store.createProject).not.toHaveBeenCalled()
  })

  it('makes a first project for a founder who has none, so Home always has one to work in', async () => {
    store.listProjects.mockResolvedValue([])
    store.createProject.mockResolvedValue({ id: 'p1', name: FIRST_PROJECT_NAME })
    renderRoute()
    expect(await screen.findByText(`Projects: ${FIRST_PROJECT_NAME}`)).toBeInTheDocument()
    expect(store.createProject).toHaveBeenCalledWith(FIRST_PROJECT_NAME)
  })

  it('does not make a new first project when the projects could not be read: it says so and offers to try again', async () => {
    const user = userEvent.setup()
    store.listProjects.mockResolvedValueOnce(null)
    renderRoute()
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your projects.')
    expect(store.createProject).not.toHaveBeenCalled()
    store.listProjects.mockResolvedValueOnce([{ id: 'p1', name: 'Kindred Gifting' }])
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Projects: Kindred Gifting')).toBeInTheDocument()
  })

  it('says it could not load if the first project could not be made either', async () => {
    store.listProjects.mockResolvedValue([])
    store.createProject.mockResolvedValue(null)
    renderRoute()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('opens the account page from Home', async () => {
    const user = userEvent.setup()
    store.listProjects.mockResolvedValue([{ id: 'p1', name: 'Kindred Gifting' }])
    renderRoute()
    await user.click(await screen.findByRole('button', { name: 'Account now' }))
    expect(await screen.findByText('The account page')).toBeInTheDocument()
  })

  it('signs out and goes to the sign-in screen', async () => {
    const user = userEvent.setup()
    store.listProjects.mockResolvedValue([{ id: 'p1', name: 'Kindred Gifting' }])
    renderRoute()
    await user.click(await screen.findByRole('button', { name: 'Sign out now' }))
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Sign in here')).toBeInTheDocument()
  })

  it('reads again for another founder on the same browser, and never shows the last one\'s projects meanwhile', async () => {
    store.listProjects.mockResolvedValueOnce([{ id: 'p1', name: 'First founder project' }])
    renderRoute()
    expect(await screen.findByText('Projects: First founder project')).toBeInTheDocument()
    let finish!: (projects: ProjectSummary[]) => void
    store.listProjects.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    useAuth.setState({ user: { id: 'u2', email: 'other@example.com', name: 'Other', onboarded: true } })
    expect(await screen.findByRole('status', { name: 'Loading your projects' })).toBeInTheDocument()
    expect(screen.queryByText(/First founder project/)).not.toBeInTheDocument()
    finish([{ id: 'p9', name: 'Second founder project' }])
    expect(await screen.findByText('Projects: Second founder project')).toBeInTheDocument()
    expect(screen.getByText('User: Other')).toBeInTheDocument()
  })

  it('reads the projects again from the store after one is made, and gives Home the fresh list', async () => {
    const user = userEvent.setup()
    store.listProjects.mockResolvedValueOnce([{ id: 'p1', name: 'Kindred Gifting' }])
    renderRoute()
    await screen.findByText('Projects: Kindred Gifting')
    store.createProject.mockResolvedValue({ id: 'p2', name: 'Pet sitting' })
    store.listProjects.mockResolvedValueOnce([{ id: 'p1', name: 'Kindred Gifting' }, { id: 'p2', name: 'Pet sitting' }])
    await user.click(screen.getByRole('button', { name: 'Make a project' }))
    expect(await screen.findByText('Projects: Kindred Gifting, Pet sitting')).toBeInTheDocument()
    expect(store.createProject).toHaveBeenCalledWith('Pet sitting')
    await waitFor(() => expect(document.title).toBe('made p2'))
  })

  it('adds the new project to the list it has if the fresh read fails, since the project was made', async () => {
    const user = userEvent.setup()
    store.listProjects.mockResolvedValueOnce([{ id: 'p1', name: 'Kindred Gifting' }])
    renderRoute()
    await screen.findByText('Projects: Kindred Gifting')
    store.createProject.mockResolvedValue({ id: 'p2', name: 'Pet sitting' })
    store.listProjects.mockResolvedValueOnce(null)
    await user.click(screen.getByRole('button', { name: 'Make a project' }))
    expect(await screen.findByText('Projects: Kindred Gifting, Pet sitting')).toBeInTheDocument()
  })

  it('changes nothing in the list when a project could not be made', async () => {
    const user = userEvent.setup()
    store.listProjects.mockResolvedValueOnce([{ id: 'p1', name: 'Kindred Gifting' }])
    renderRoute()
    await screen.findByText('Projects: Kindred Gifting')
    store.createProject.mockResolvedValue(null)
    await user.click(screen.getByRole('button', { name: 'Make a project' }))
    await waitFor(() => expect(document.title).toBe('not made'))
    expect(screen.getByText('Projects: Kindred Gifting')).toBeInTheDocument()
    expect(store.listProjects).toHaveBeenCalledTimes(1)
  })

  it('shows a new name after a rename, read from the store', async () => {
    const user = userEvent.setup()
    store.listProjects.mockResolvedValueOnce([{ id: 'p1', name: 'Kindred Gifting' }])
    renderRoute()
    await screen.findByText('Projects: Kindred Gifting')
    store.renameProject.mockResolvedValue({ id: 'p1', name: 'Kindred Gifts' })
    store.listProjects.mockResolvedValueOnce([{ id: 'p1', name: 'Kindred Gifts' }])
    await user.click(screen.getByRole('button', { name: 'Rename a project' }))
    expect(await screen.findByText('Projects: Kindred Gifts')).toBeInTheDocument()
    expect(store.renameProject).toHaveBeenCalledWith('p1', 'Kindred Gifts')
  })

  it('sends a founder who has not been through the introduction there first, and reads and makes nothing before it', async () => {
    useAuth.setState({ user: { id: 'u1', email: 'm@example.com', name: 'Megan', onboarded: false } })
    store.listProjects.mockResolvedValue([])
    renderRoute()
    expect(await screen.findByText('The introduction')).toBeInTheDocument()
    expect(store.listProjects).not.toHaveBeenCalled()
    expect(store.createProject).not.toHaveBeenCalled()
  })
})
