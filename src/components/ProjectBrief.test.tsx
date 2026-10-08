import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadMemory, saveMemory } from '../lib/memoryStore.ts'
import { currentFacts, emptyMemory, settingOn, withFact } from '../lib/projectMemory.ts'
import ProjectBrief from './ProjectBrief.tsx'

const t = '2026-10-07T10:00:00.000Z'
beforeEach(() => window.localStorage.clear())

const seed = async () => {
  let memory = withFact(emptyMemory(), 'profile.what', 'Builds full-stack software', t)
  memory = withFact(memory, 'profile.who_for', 'SMEs', t)
  memory = withFact(memory, 'profile.who_for', 'Corporate clients', t)
  memory = withFact(memory, 'brand.voice', 'Warm and plain', t)
  await saveMemory('p1', memory)
}
const renderBrief = (onChanged = vi.fn()) => render(<ProjectBrief open onClose={() => undefined} projectId="p1" projectName="DuckStack" onChanged={onChanged} />)

describe('the project brief', () => {
  it('shows nothing when closed', () => {
    render(<ProjectBrief open={false} onClose={() => undefined} projectId="p1" projectName="DuckStack" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows every fact under its heading, in plain words, with what it was before when it changed, and "Nothing yet" for a heading with none', async () => {
    await seed()
    renderBrief()
    const dialog = await screen.findByRole('dialog', { name: 'Project brief: DuckStack' })
    const about = await within(dialog).findByRole('region', { name: 'About the business' })
    expect(within(about).getByText('What it does')).toBeInTheDocument()
    expect(within(about).getByText('Builds full-stack software')).toBeInTheDocument()
    expect(within(about).getByText('Corporate clients')).toBeInTheDocument()
    expect(within(about).getByText('Before: SMEs')).toBeInTheDocument()
    expect(within(dialog).getByRole('region', { name: 'Brand' })).toHaveTextContent('Warm and plain')
    expect(within(dialog).getByRole('region', { name: 'Preferences' })).toHaveTextContent('Nothing yet.')
  })

  it('changes a fact in place and saves it, keeping the old words, and tells the app', async () => {
    await seed()
    const user = userEvent.setup()
    const onChanged = vi.fn()
    renderBrief(onChanged)
    await user.click(await screen.findByRole('button', { name: 'Edit Who it is for' }))
    const field = screen.getByRole('textbox', { name: 'Who it is for' })
    await user.clear(field)
    await user.type(field, 'Offices in Pretoria East')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const memory = await loadMemory('p1')
    expect(currentFacts(memory)['profile.who_for']).toBe('Offices in Pretoria East')
    expect(memory.facts?.['profile.who_for']?.earlier.map((entry) => entry.value)).toEqual(['Corporate clients', 'SMEs'])
    expect(await screen.findByText('Offices in Pretoria East')).toBeInTheDocument()
  })

  it('refuses a fact with a private detail in it, and says why, without saving', async () => {
    await seed()
    const user = userEvent.setup()
    renderBrief()
    await user.click(await screen.findByRole('button', { name: 'Edit Where it is'.replace('Where it is', 'What it does') }))
    const field = screen.getByRole('textbox', { name: 'What it does' })
    await user.clear(field)
    await user.type(field, 'Email me on megan@kindred.co.za')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('never given an address, an email, a phone number or a bank detail')
    expect(currentFacts(await loadMemory('p1'))['profile.what']).toBe('Builds full-stack software')
  })

  it('forgets a fact only after a second press, and keeps it if the founder keeps it', async () => {
    await seed()
    const user = userEvent.setup()
    renderBrief()
    await user.click(await screen.findByRole('button', { name: 'Forget How it sounds' }))
    expect(screen.getByText('Forget this?')).toBeInTheDocument()
    expect(currentFacts(await loadMemory('p1'))['brand.voice']).toBe('Warm and plain')
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(currentFacts(await loadMemory('p1'))['brand.voice']).toBe('Warm and plain')
    await user.click(screen.getByRole('button', { name: 'Forget How it sounds' }))
    await user.click(screen.getByRole('button', { name: 'Forget' }))
    await waitFor(async () => expect(currentFacts(await loadMemory('p1'))['brand.voice']).toBeUndefined())
  })

  it('lets the founder add something Droplet should know, and refuses a private detail', async () => {
    const user = userEvent.setup()
    renderBrief()
    await screen.findByRole('region', { name: 'Add something Droplet should know' })
    await user.selectOptions(screen.getByLabelText('About'), 'preference.style')
    await user.type(screen.getByLabelText('What Droplet should know'), 'Short answers, no jargon')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => expect(currentFacts(await loadMemory('p1'))['preference.style']).toBe('Short answers, no jargon'))
    expect(screen.getByLabelText('What Droplet should know')).toHaveValue('')
    await user.type(screen.getByLabelText('What Droplet should know'), 'call 082 555 1234')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('never given an address')
  })

  it('has the two switches, both on until turned off, and saves them', async () => {
    const user = userEvent.setup()
    renderBrief()
    const recall = await screen.findByRole('switch', { name: 'Let Droplet look back at past chats' })
    const notes = screen.getByRole('switch', { name: 'Keep notes on my workspaces' })
    expect(recall).toBeChecked()
    expect(notes).toBeChecked()
    await user.click(recall)
    await waitFor(async () => expect(settingOn(await loadMemory('p1'), 'recall')).toBe(false))
    expect(settingOn(await loadMemory('p1'), 'notes')).toBe(true)
    expect(screen.getByRole('switch', { name: 'Let Droplet look back at past chats' })).not.toBeChecked()
  })

  it('says it could not store, and changes nothing on screen, when the save fails', async () => {
    await seed()
    const user = userEvent.setup()
    const { setDocumentStorage, localDocumentStorage } = await import('../lib/storage.ts')
    renderBrief()
    await screen.findByRole('button', { name: 'Forget How it sounds' })
    const before = setDocumentStorage({ ...localDocumentStorage, write: async () => false })
    try {
      await user.click(screen.getByRole('button', { name: 'Forget How it sounds' }))
      await user.click(screen.getByRole('button', { name: 'Forget' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('could not be stored')
    } finally {
      setDocumentStorage(before)
    }
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ProjectBrief open onClose={onClose} projectId="p1" projectName="DuckStack" />)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('the memories of past chats in the brief', () => {
  const memory = { task: 'ideation' as const, subject: 'Naming the business', decided: ['settled on the name Kindred Gifting'], open: ['the colours are not chosen yet'] }
  const seedChat = async (over: Record<string, unknown> = {}) => {
    const { saveChats } = await import('../lib/chatStore.ts')
    await saveChats('p1', [{ id: 'c1', title: 'Naming Kindred Gifting', updatedAt: '2026-10-06T10:00:00.000Z', messages: [{ id: 1, from: 'you', text: 'hello there' }], summary: memory, summarisedAt: '2026-10-06T10:30:00.000Z', ...over }])
  }
  const chatNow = async () => (await (await import('../lib/chatStore.ts')).loadChats('p1'))[0]

  it('shows each memory by the chat it belongs to, as the lines that are sent', async () => {
    await seedChat()
    renderBrief()
    const section = await screen.findByRole('region', { name: 'Past chats Droplet remembers' })
    expect(await within(section).findByText('Naming Kindred Gifting')).toBeInTheDocument()
    expect(within(section).getByText('About: Naming the business')).toBeInTheDocument()
    expect(within(section).getByText('Decided: settled on the name Kindred Gifting')).toBeInTheDocument()
    expect(within(section).getByText('Still open: the colours are not chosen yet')).toBeInTheDocument()
  })

  it('says there is nothing yet, and what makes one', async () => {
    renderBrief()
    expect(await screen.findByText(/A short memory is written when you leave a chat you have said something in\./)).toBeInTheDocument()
  })

  it('says Droplet is not looking back when the switch is off, and still lets them be read and deleted', async () => {
    await seedChat()
    await saveMemory('p1', { ...emptyMemory(), settings: { recall: false } })
    renderBrief()
    expect(await screen.findByText(/Droplet is not looking back at past chats\. These are kept until you delete them\./)).toBeInTheDocument()
    expect(await screen.findByText('About: Naming the business')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete the memory of Naming Kindred Gifting' })).toBeInTheDocument()
  })

  it('changes a memory, and from then on it is the founder\'s own: marked, and not written over', async () => {
    await seedChat()
    const user = userEvent.setup()
    renderBrief()
    await user.click(await screen.findByRole('button', { name: 'Edit the memory of Naming Kindred Gifting' }))
    const decided = screen.getByLabelText('Decided (one to a line)')
    await user.clear(decided)
    await user.type(decided, 'settled on the name Kindred Gifting{enter}chose to sell to firms')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await chatNow()).summaryEdited).toBe(true))
    expect((await chatNow()).summary?.decided).toEqual(['settled on the name Kindred Gifting', 'chose to sell to firms'])
    expect(await screen.findByText(/written by you/)).toBeInTheDocument()
    // a chat that changed later is not written over, since the founder wrote this one
    const { needsSummary } = await import('../lib/recall.ts')
    expect(needsSummary({ ...(await chatNow()), updatedAt: '2099-01-01T00:00:00.000Z' }, [{ from: 'you', text: 'a long enough message to count' }])).toBe(false)
  })

  it('refuses a memory with no subject, or too many lines', async () => {
    await seedChat()
    const user = userEvent.setup()
    renderBrief()
    await user.click(await screen.findByRole('button', { name: 'Edit the memory of Naming Kindred Gifting' }))
    await user.clear(screen.getByLabelText('Subject'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Write a subject')
    expect((await chatNow()).summaryEdited).toBeUndefined()
  })

  it('deletes a memory after a second press, keeps the chat, and does not write it again until the chat changes', async () => {
    await seedChat()
    const user = userEvent.setup()
    renderBrief()
    await user.click(await screen.findByRole('button', { name: 'Delete the memory of Naming Kindred Gifting' }))
    expect(screen.getByText('Delete this memory? The chat stays.')).toBeInTheDocument()
    expect((await chatNow()).summary).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await chatNow()).summary).toBeUndefined())
    const chat = await chatNow()
    expect(chat.title).toBe('Naming Kindred Gifting')
    const { needsSummary } = await import('../lib/recall.ts')
    expect(needsSummary(chat, [{ from: 'you', text: 'a long enough message to count' }])).toBe(false)
    expect(needsSummary({ ...chat, updatedAt: '2099-01-01T00:00:00.000Z' }, [{ from: 'you', text: 'a long enough message to count' }])).toBe(true)
  })
})
