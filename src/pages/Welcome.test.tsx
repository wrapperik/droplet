import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIRST_PROJECT_NAME, INTRO_SLIDES, NAME_STEP } from '../lib/onboarding.ts'
import { useAuth } from '../store/auth.ts'

const store = { listProjects: vi.fn(), createProject: vi.fn(), renameProject: vi.fn() }
vi.mock('../lib/projectsStore.ts', () => ({
  listProjects: () => store.listProjects(),
  createProject: (name: string) => store.createProject(name),
  renameProject: (id: string, name: string) => store.renameProject(id, name),
}))

import Welcome from './Welcome.tsx'

const completeOnboarding = vi.fn(async () => {})
const signedIn = (onboarded: boolean) =>
  useAuth.setState({ status: 'signedIn', user: { id: 'u1', email: 'm@example.com', name: 'Megan', onboarded }, completeOnboarding })

beforeEach(() => {
  store.listProjects.mockReset().mockResolvedValue([{ id: 'p1', name: FIRST_PROJECT_NAME }])
  store.createProject.mockReset().mockResolvedValue({ id: 'p2', name: 'made' })
  store.renameProject.mockReset().mockResolvedValue({ id: 'p1', name: 'renamed' })
  completeOnboarding.mockClear()
  signedIn(false)
})
afterEach(() => useAuth.setState({ status: 'loading', user: null }))

const renderWelcome = () =>
  render(
    <MemoryRouter initialEntries={['/welcome']}>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/home" element={<p>The app</p>} />
        <Route path="/sign-in" element={<p>Sign in here</p>} />
      </Routes>
    </MemoryRouter>,
  )

const title = (text: string) => screen.findByRole('heading', { level: 1, name: text })
const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /^Next/ }))
const toTheName = async (user: ReturnType<typeof userEvent.setup>) => {
  for (const slide of INTRO_SLIDES) {
    await title(slide.title)
    await next(user)
  }
  await title(NAME_STEP.title)
}

describe('the introduction', () => {
  it('opens on what Droplet is, with one dot for each step, the first one current', async () => {
    renderWelcome()
    expect(await title(INTRO_SLIDES[0].title)).toBeInTheDocument()
    const dots = screen.getAllByRole('button', { name: /, step \d of 5$/ })
    expect(dots).toHaveLength(INTRO_SLIDES.length + 1)
    expect(dots[0]).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
  })

  it('goes through every step in order with Next and back again with Back, moving focus to the new title', async () => {
    const user = userEvent.setup()
    renderWelcome()
    await title(INTRO_SLIDES[0].title)
    await next(user)
    expect(await title(INTRO_SLIDES[1].title)).toHaveFocus()
    await user.click(screen.getByRole('button', { name: /Back/ }))
    expect(await title(INTRO_SLIDES[0].title)).toBeInTheDocument()
  })

  it('turns the page with the arrow keys, and a dot goes straight to its step', async () => {
    const user = userEvent.setup()
    renderWelcome()
    await title(INTRO_SLIDES[0].title)
    await user.keyboard('{ArrowRight}')
    await title(INTRO_SLIDES[1].title)
    await user.keyboard('{ArrowLeft}')
    await title(INTRO_SLIDES[0].title)
    await user.click(screen.getByRole('button', { name: `${INTRO_SLIDES[3].label}, step 4 of 5` }))
    await title(INTRO_SLIDES[3].title)
    for (const point of INTRO_SLIDES[3].points ?? []) expect(screen.getByText(point)).toBeInTheDocument()
  })

  it('can be skipped to the last step, which asks for the name of the first project', async () => {
    const user = userEvent.setup()
    renderWelcome()
    await user.click(await screen.findByRole('button', { name: 'Skip intro' }))
    await title(NAME_STEP.title)
    expect(screen.getByLabelText('Project name')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip intro' })).not.toBeInTheDocument()
  })

  it('shows what is typed on the picture of the project as it is typed', async () => {
    const user = userEvent.setup()
    renderWelcome()
    await toTheName(user)
    await user.type(screen.getByLabelText('Project name'), 'Kindred Gifting')
    expect(screen.getByText('Kindred Gifting')).toBeInTheDocument()
  })

  it('keeps the arrow keys for the cursor while typing the name', async () => {
    const user = userEvent.setup()
    renderWelcome()
    await toTheName(user)
    await user.type(screen.getByLabelText('Project name'), 'Kin{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(NAME_STEP.title)
  })
})

describe('finishing', () => {
  it('renames the project that was made for the founder to what they typed, marks the introduction done and opens the app', async () => {
    const user = userEvent.setup()
    renderWelcome()
    await toTheName(user)
    await user.type(screen.getByLabelText('Project name'), '  Kindred Gifting ')
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByText('The app')).toBeInTheDocument()
    expect(store.renameProject).toHaveBeenCalledWith('p1', 'Kindred Gifting')
    expect(store.createProject).not.toHaveBeenCalled()
    expect(completeOnboarding).toHaveBeenCalledTimes(1)
  })

  it('makes the first project when the founder has none, and pressing Enter in the field starts', async () => {
    const user = userEvent.setup()
    store.listProjects.mockResolvedValue([])
    renderWelcome()
    await toTheName(user)
    await user.type(screen.getByLabelText('Project name'), 'Kindred Gifting{Enter}')
    expect(await screen.findByText('The app')).toBeInTheDocument()
    expect(store.createProject).toHaveBeenCalledWith('Kindred Gifting')
  })

  it('leaves the projects alone when the name is skipped, and still finishes (Home makes a first project)', async () => {
    const user = userEvent.setup()
    renderWelcome()
    await toTheName(user)
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByText('The app')).toBeInTheDocument()
    expect(store.listProjects).not.toHaveBeenCalled()
    expect(store.createProject).not.toHaveBeenCalled()
    expect(store.renameProject).not.toHaveBeenCalled()
    expect(completeOnboarding).toHaveBeenCalledTimes(1)
  })

  it('says so and does not finish when the projects could not be read, so there is a way to try again', async () => {
    const user = userEvent.setup()
    store.listProjects.mockResolvedValueOnce(null)
    renderWelcome()
    await toTheName(user)
    await user.type(screen.getByLabelText('Project name'), 'Kindred Gifting')
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not set up your project.')
    expect(completeOnboarding).not.toHaveBeenCalled()
    expect(store.createProject).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByText('The app')).toBeInTheDocument()
    expect(completeOnboarding).toHaveBeenCalledTimes(1)
  })

  it('does not finish when the project could not be renamed', async () => {
    const user = userEvent.setup()
    store.renameProject.mockResolvedValue(null)
    renderWelcome()
    await toTheName(user)
    await user.type(screen.getByLabelText('Project name'), 'Kindred Gifting')
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('ignores a second press while it is working', async () => {
    const user = userEvent.setup()
    let release!: () => void
    store.listProjects.mockReturnValue(new Promise((resolve) => (release = () => resolve([]))))
    renderWelcome()
    await toTheName(user)
    await user.type(screen.getByLabelText('Project name'), 'Kindred Gifting')
    await user.click(screen.getByRole('button', { name: 'Start' }))
    const working = await screen.findByRole('button', { name: 'One moment' })
    expect(working).toBeDisabled()
    release()
    await screen.findByText('The app')
    expect(store.listProjects).toHaveBeenCalledTimes(1)
  })
})

describe('looking again', () => {
  beforeEach(() => signedIn(true))

  it('has no step for naming a project, since the founder has one, and ends by going back to the app', async () => {
    const user = userEvent.setup()
    renderWelcome()
    for (const slide of INTRO_SLIDES) {
      await title(slide.title)
      if (slide !== INTRO_SLIDES[INTRO_SLIDES.length - 1]) await next(user)
    }
    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to Droplet' }))
    expect(await screen.findByText('The app')).toBeInTheDocument()
    expect(store.listProjects).not.toHaveBeenCalled()
  })

  it('can be left at once with Skip intro', async () => {
    const user = userEvent.setup()
    renderWelcome()
    await user.click(await screen.findByRole('button', { name: 'Skip intro' }))
    await waitFor(() => expect(screen.getByText('The app')).toBeInTheDocument())
  })
})

describe('not signed in', () => {
  it('goes to sign in', async () => {
    useAuth.setState({ status: 'signedOut', user: null })
    renderWelcome()
    expect(await screen.findByText('Sign in here')).toBeInTheDocument()
  })
})
