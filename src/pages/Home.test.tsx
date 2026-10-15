import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadBoard } from '../lib/boardStore.ts'
import { loadChats, saveChats } from '../lib/chatStore.ts'
import { currentFacts, emptyMemory, withFact, withIdea, withSetting } from '../lib/projectMemory.ts'
import { loadMemory, saveMemory } from '../lib/memoryStore.ts'
import { loadNotes } from '../lib/notesStore.ts'
import { loadPalette } from '../lib/projectStore.ts'
import { setDocumentStorage, type DocumentStorage } from '../lib/storage.ts'
import { slowMemoryStorage } from '../test/slowStorage.ts'
import { useWorkMode } from '../store/workMode.ts'
import Home from './Home.tsx'

// Home with the composer's server standing in: what is asked of it is recorded, and what it says back is what the test decides.
type Asked = { intent: string; mode?: string; view?: string; invoice?: { lines: { description: string }[] }; workspace?: unknown }
let asked: Asked[] = []
let answers: unknown[] = []
// What the server says on a GET: where the founder's Advanced allowance stands. Null is a server that cannot say.
// Short memories of chats are asked for in the background with a kind of their own. What was asked is kept apart from messages, and what the server
// says back is the memory the test decides (null is a server that found none it could trust).
let summaries: { messages: { role: string; text: string }[] }[] = []
let summaryAnswer: unknown = null
// The same for a digest of a workspace, asked for in the background after a save.
let digests: { workspace: string; items: { ref: string; text: string; where?: string; starred?: boolean }[] }[] = []
let digestAnswer: unknown = null
let allowanceNow: { advancedLeft: number; advancedLimit: number; resetsAt: string | null } | null = null

const reply = (task: string, message: string, actions: unknown[] = []) => ({ outcome: 'valid', answeredBy: 'base', turn: { task, message, actions, memoryUsed: [] } })
// A reply that opens a workspace the founder asked for, quoting their own words as the composer must.
const opening = (task: string, message: string, quote: string) => ({ outcome: 'valid', answeredBy: 'base', turn: { task, message, actions: [], opens: { because: 'asked', quote }, memoryUsed: [] } })

beforeEach(() => {
  window.localStorage.clear()
  // Most of these tests are of Workspace mode, where the invoice opens with every tool at once. Guide mode has tests of its own.
  useWorkMode.setState({ mode: 'workspace' })
  asked = []
  answers = []
  summaries = []
  summaryAnswer = null
  digests = []
  digestAnswer = null
  allowanceNow = { advancedLeft: 10, advancedLimit: 10, resetsAt: null }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { method?: string; body: string }) => {
      if (init.method === 'GET') {
        return allowanceNow ? new Response(JSON.stringify({ allowance: allowanceNow }), { status: 200 }) : new Response('{}', { status: 500 })
      }
      const sent = JSON.parse(init.body) as { kind?: string }
      if (sent.kind === 'digest_workspace') {
        digests.push(sent as never)
        return new Response(JSON.stringify({ kind: 'digest_workspace', answeredBy: 'base', digest: digestAnswer }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (sent.kind === 'summarise_chat') {
        summaries.push(sent as never)
        return new Response(JSON.stringify({ kind: 'summarise_chat', answeredBy: 'base', summary: summaryAnswer }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      asked.push(sent as never)
      const body = answers[Math.min(asked.length - 1, answers.length - 1)]
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const renderHome = () =>
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  )

const loadChatsFor = () => loadChats('duckstack')

// The task bar of whichever workspace is open: the parts of the invoice (or of the brand in Guide mode), the board's tools, or the brand's own toolbar. Null when none is.
const taskBar = () => screen.queryByRole('group', { name: /^Parts of the (brand|invoice)$/ }) ?? screen.queryByRole('toolbar', { name: 'Board tools' }) ?? screen.queryByRole('toolbar', { name: 'Palette toolbar' })

// In Workspace mode the client's name is in the Client part of the panel, which is always there.
const clientName = async (_user: ReturnType<typeof userEvent.setup>) => screen.getByLabelText('Client or company name')

// The tasks are chosen from the message bar's menu: the sidebar has no list of them.
const pickTask = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
  await waitFor(() => expect(screen.queryByRole('menu', { name: 'Workspaces' })).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: 'Choose a task' }))
  await user.click(await screen.findByRole('menuitem', { name }))
}

const say = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByLabelText('Describe what you need'), text)
  await user.click(screen.getByRole('button', { name: 'Send' }))
}

describe('asking Droplet to fill in the invoice', () => {
  it('fills in the invoice that is on screen, from what the founder said, in one step', async () => {
    const user = userEvent.setup()
    answers = [
      reply('invoice', 'I added the box.', [
        { type: 'set_client', name: 'Karoo Candles' },
        { type: 'add_line', description: 'Soy candle', quantity: 30, unitPrice: 'R85' },
      ]),
    ]
    renderHome()
    await pickTask(user, /Make an invoice/)
    await say(user, 'Bill Karoo Candles for 30 soy candles at R85 each')
    await waitFor(() => expect(screen.getByText('I added the box.')).toBeInTheDocument())
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ view: 'invoice' })
    expect(asked[0].workspace).toBeUndefined()
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Karoo Candles')
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Soy candle')
    expect(screen.getByLabelText('Price each, in rand')).toHaveValue('85.00')
    // one undo takes back everything it did
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await clientName(user)).toHaveValue('')
    expect(screen.getByLabelText('Price each, in rand')).toHaveValue('')
  })

  it('changes the part of the panel it touched, which is always on screen to edit, and Undo this takes the change back', async () => {
    const user = userEvent.setup()
    answers = [reply('invoice', 'Set.', [{ type: 'set_client', name: 'Karoo Candles' }])]
    renderHome()
    await pickTask(user, /Make an invoice/)
    expect(screen.getByLabelText('Client or company name')).toHaveValue('')
    await say(user, 'It is for Karoo Candles')
    await screen.findByText('Set.')
    expect(await screen.findByLabelText('Client or company name')).toHaveValue('Karoo Candles')
    await user.click(screen.getByRole('button', { name: 'Undo this' }))
    expect(screen.getByLabelText('Client or company name')).toHaveValue('')
  })

  it('refuses the whole answer, and changes nothing, when it holds a price the founder did not write', async () => {
    const user = userEvent.setup()
    answers = [
      reply('invoice', 'I added both lines.', [
        { type: 'add_line', description: 'Soy candle', quantity: 30, unitPrice: '85' },
        { type: 'set_terms', terms: '7' },
      ]),
    ]
    renderHome()
    await pickTask(user, /Make an invoice/)
    // the answer is checked again in the browser, which refuses a price nobody wrote even if the server let it through
    await say(user, 'Add 30 soy candles, due in 7 days')
    await waitFor(() => expect(screen.getByText(/I got an answer I could not use/)).toBeInTheDocument())
    expect(screen.getByLabelText('Price each, in rand')).toHaveValue('')
  })

  it('opens the invoice and asks again when the request belongs there and no invoice is open, then fills it in', async () => {
    const user = userEvent.setup()
    answers = [
      opening('invoice', 'I am opening the invoice workspace.', 'Invoice them for 12 gift boxes'),
      reply('invoice', 'I added the line.', [{ type: 'add_line', description: 'Gift box', quantity: 12, unitPrice: '450' }]),
    ]
    renderHome()
    await say(user, 'Invoice them for 12 gift boxes at 450')
    await waitFor(() => expect(screen.getByText('I added the line.')).toBeInTheDocument())
    expect(asked).toHaveLength(2)
    expect(asked[0].view).toBeUndefined()
    expect(asked[1]).toMatchObject({ view: 'invoice', intent: 'Invoice them for 12 gift boxes at 450' })
    expect(asked[1].invoice?.lines).toHaveLength(1)
    // the first answer was only the way there: the second says what was done, so the founder is not told twice
    expect(screen.queryByText('I am opening the invoice workspace.')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Gift box')
  })

  it('asks again only once, however the second answer comes back', async () => {
    const user = userEvent.setup()
    answers = [opening('invoice', 'Opening the invoice.', 'invoice colours'), opening('brand', 'That is about colours.', 'invoice colours')]
    renderHome()
    await say(user, 'invoice colours')
    await waitFor(() => expect(screen.getByText('That is about colours.')).toBeInTheDocument())
    expect(asked).toHaveLength(2)
  })

  it('opens the palette and asks again when the invoice is on screen and the request is about colours', async () => {
    const user = userEvent.setup()
    answers = [opening('brand', 'Opening the brand workspace.', 'brand colour'), reply('brand', 'Colour 1 reads best.')]
    renderHome()
    await pickTask(user, /Make an invoice/)
    await say(user, 'Which brand colour has the best contrast?')
    await waitFor(() => expect(screen.getByText('Colour 1 reads best.')).toBeInTheDocument())
    expect(asked[0].view).toBe('invoice')
    expect(asked[1].view).toBe('brand')
    expect(asked[1].workspace).toBeDefined()
    await waitFor(() => expect(within(screen.getByRole('toolbar', { name: 'Palette toolbar' })).getByRole('button', { name: 'Generate random' })).toBeInTheDocument())
  })

  it('leaves the invoice alone when the composer only answers', async () => {
    const user = userEvent.setup()
    answers = [reply('invoice', 'It still needs the name of the client.')]
    renderHome()
    await pickTask(user, /Make an invoice/)
    await say(user, 'What does it still need?')
    await waitFor(() => expect(screen.getByText('It still needs the name of the client.')).toBeInTheDocument())
    expect(await clientName(user)).toHaveValue('')
  })

  it('does not send the founder\'s address, bank details or contacts to the composer', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      'droplet-project-duckstack-memory',
      JSON.stringify({
        business: { details: { name: 'Kindred Gifting', address: '12 Jacaranda Street', email: 'hello@kindred.example', phone: '082 000 0000', vatNumber: '', accountHolder: 'Kindred', bankName: 'FNB', accountNumber: '62000000000', branchCode: '250655' }, confirmedAt: 'x' },
        clients: [],
        invoices: [],
      }),
    )
    answers = [reply('invoice', 'Fine.')]
    renderHome()
    await pickTask(user, /Make an invoice/)
    await say(user, 'What is the total?')
    await waitFor(() => expect(asked).toHaveLength(1))
    const sent = JSON.stringify(asked[0])
    for (const secret of ['Jacaranda', 'hello@kindred', '082 000', '62000000000', 'FNB', '250655']) expect(sent, secret).not.toContain(secret)
    expect(asked[0].invoice).toMatchObject({ business: { name: 'Kindred Gifting', hasAddress: true, hasBankDetails: true } })
  })
})

describe('the thread and the task menu', () => {
  // The side panel shows one exchange at a time, each a page that is a list item itself: only the messages and dividers are counted here.
  const entries = () => within(screen.getByRole('log', { name: 'Conversation' })).queryAllByRole('listitem').filter((item) => !item.classList.contains('thread__page'))
  const sendAndWait = async (user: ReturnType<typeof userEvent.setup>, text: string, answer: string) => {
    answers = [reply('chat', answer)]
    await say(user, text)
    await waitFor(() => expect(screen.getByText(answer)).toBeInTheDocument())
  }

  it('says nothing in the thread when a task is chosen', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Make an invoice/)
    await pickTask(user, /Build the brand/)
    await pickTask(user, /Get a logo/)
    expect(entries()).toHaveLength(0)
  })

  it('marks a move to another workspace with a divider, once a message is sent there', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await sendAndWait(user, 'What suits a gift business?', 'Something warm.')
    // the first message has nothing before it to have moved from
    expect(entries().map((item) => item.className)).not.toContain('thread__divider')
    await pickTask(user, /Make an invoice/)
    expect(entries()).toHaveLength(2)
    await sendAndWait(user, 'What does it need?', 'A client.')
    const items = entries()
    expect(items.map((item) => item.textContent)).toEqual([expect.stringContaining('What suits'), expect.stringContaining('Something warm.'), 'Switched workspace to Invoice', expect.stringContaining('What does it need?'), expect.stringContaining('A client.')])
    expect(items[2]).toHaveClass('thread__divider')
  })

  it('shows one divider, not one per move, when the founder moves about without saying anything', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await sendAndWait(user, 'Hello', 'Hi.')
    await pickTask(user, /Make an invoice/)
    await pickTask(user, /Build the brand/)
    await pickTask(user, /Get a logo/)
    await pickTask(user, /Make an invoice/)
    await sendAndWait(user, 'Now?', 'Here.')
    const dividers = entries().filter((item) => item.classList.contains('thread__divider'))
    expect(dividers.map((item) => item.textContent)).toEqual(['Switched workspace to Invoice'])
  })

  it('shows no divider for a move that was made and undone before anything was said', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await sendAndWait(user, 'Hello', 'Hi.')
    await pickTask(user, /Make an invoice/)
    await pickTask(user, /Build the brand/)
    await sendAndWait(user, 'Again', 'Still here.')
    expect(entries().filter((item) => item.classList.contains('thread__divider'))).toHaveLength(0)
  })

  it('does not send a divider to the composer as part of the conversation', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await sendAndWait(user, 'Hello', 'Hi.')
    await pickTask(user, /Make an invoice/)
    await sendAndWait(user, 'Next', 'Done.')
    await pickTask(user, /Build the brand/)
    await sendAndWait(user, 'Last', 'Ok.')
    const history = (asked[2] as unknown as { history: { text: string }[] }).history
    expect(history.map((item) => item.text)).toEqual(['Hello', 'Hi.', 'Next', 'Done.'])
  })
})

describe('the start of the conversation', () => {
  it('has no animation preview on the screen', () => {
    renderHome()
    expect(screen.queryByLabelText('Thinking animation preview')).not.toBeInTheDocument()
    expect(screen.queryByText(/Thinking animation preview/)).not.toBeInTheDocument()
  })

  it('offers the tip about the workspace menu only before the first message', async () => {
    const user = userEvent.setup()
    renderHome()
    expect(screen.getByRole('button', { name: /Show me a menu of available workspaces/ })).toBeInTheDocument()
    answers = [reply('chat', 'Hello.')]
    await say(user, 'Hi')
    await waitFor(() => expect(screen.getByText('Hello.')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Show me a menu of available workspaces/ })).not.toBeInTheDocument()
    // the menu itself is still there, behind the plus
    expect(screen.getByRole('button', { name: 'Choose a task' })).toBeInTheDocument()
  })

  it('greets the founder by the time of day over an empty chat, and not once something has been said', async () => {
    const user = userEvent.setup()
    const clock = vi.spyOn(Date.prototype, 'getHours').mockReturnValue(9)
    renderHome()
    expect(screen.getByRole('heading', { name: 'Good morning, Megan' })).toBeInTheDocument()
    clock.mockRestore()
    answers = [reply('chat', 'Hello.')]
    await say(user, 'Hi')
    await screen.findByText('Hello.')
    expect(screen.queryByRole('heading', { name: /Good morning/ })).not.toBeInTheDocument()
  })

  it('has no welcome-back message for a returning founder', async () => {
    renderHome()
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(screen.queryByText(/Welcome back/)).not.toBeInTheDocument()
  })

  it('keeps the tip while a workspace is open and nothing has been said', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    expect(screen.getByRole('button', { name: /Show me a menu of available workspaces/ })).toBeInTheDocument()
  })
})

describe('going back to the full chat', () => {
  const back = () => screen.getByRole('button', { name: 'Back to the full chat' })
  const toolbar = taskBar
  const prompt = () => screen.getByText(/You have unsaved changes in/)

  it('has no such button until a workspace is open', async () => {
    const user = userEvent.setup()
    renderHome()
    expect(screen.queryByRole('button', { name: 'Back to the full chat' })).not.toBeInTheDocument()
    await pickTask(user, /Build the brand/)
    expect(back()).toBeInTheDocument()
  })

  it('closes a workspace nobody has changed at once, without asking', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await user.click(back())
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument()
  })

  it('asks first, in the thread, when the palette has changes, and saves it from a button there before it closes', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await user.click(back())
    expect(prompt()).toHaveTextContent('the brand palette')
    // nothing has been closed or saved yet
    expect(toolbar()).toBeInTheDocument()
    expect(await loadPalette('duckstack')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save the palette' }))
    expect(await loadPalette('duckstack')).not.toBeNull()
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(screen.getByText(/I saved the palette\. Everything is saved/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leave without saving' })).not.toBeInTheDocument()
  })

  it('closes without saving when asked to, and keeps nothing', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await user.click(back())
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }))
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(await loadPalette('duckstack')).toBeNull()
    expect(screen.getByText('I closed the workspace without saving.')).toBeInTheDocument()
  })

  it('stays in the workspace when asked to keep working', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await user.click(back())
    await user.click(screen.getByRole('button', { name: 'Keep working' }))
    expect(toolbar()).toBeInTheDocument()
    expect(screen.getByText('Okay, I left the workspace as it is.')).toBeInTheDocument()
    // and can be asked again
    await user.click(back())
    expect(screen.getAllByText(/You have unsaved changes in/)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Save the palette' })).toBeInTheDocument()
  })

  it('does not ask twice while a question is still open', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await user.click(back())
    await user.click(back())
    expect(screen.getAllByText(/You have unsaved changes in/)).toHaveLength(1)
  })

  it('opens the invoice note of what would be remembered from the button, and closes only once the founder has confirmed it', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Make an invoice/)
    await user.type(await clientName(user), 'Pretoria Print Works')
    await user.click(back())
    expect(prompt()).toHaveTextContent('the invoice')
    await user.click(screen.getByRole('button', { name: 'Review and save the invoice' }))
    // the note opens and nothing is kept until it is confirmed
    const note = screen.getByRole('dialog', { name: 'Save to DuckStack' })
    expect(toolbar()).toBeInTheDocument()
    expect(window.localStorage.getItem('droplet-project-duckstack-memory')).toBeNull()
    await user.click(within(note).getByRole('button', { name: 'Confirm and save' }))
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(screen.getByText(/I saved the invoice\. Everything is saved/)).toBeInTheDocument()
    expect(window.localStorage.getItem('droplet-project-duckstack-memory')).not.toBeNull()
  })

  it('stays open, with the question, if the invoice note is closed without confirming', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Make an invoice/)
    await user.type(await clientName(user), 'Pretoria Print Works')
    await user.click(back())
    await user.click(screen.getByRole('button', { name: 'Review and save the invoice' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Save to DuckStack' })).getByRole('button', { name: 'Cancel' }))
    expect(toolbar()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave without saving' })).toBeInTheDocument()
    expect(window.localStorage.getItem('droplet-project-duckstack-memory')).toBeNull()
  })

  it('does not send the question to the composer as part of the conversation', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    answers = [reply('chat', 'Fine.')]
    await say(user, 'Hello')
    await waitFor(() => expect(screen.getByText('Fine.')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await user.click(back())
    await user.click(screen.getByRole('button', { name: 'Keep working' }))
    answers = [reply('chat', 'Again.')]
    await say(user, 'Next')
    await waitFor(() => expect(screen.getByText('Again.')).toBeInTheDocument())
    const history = (asked[1] as unknown as { history: { text: string }[] }).history
    expect(history.map((item) => item.text)).toEqual(['Hello', 'Fine.'])
  })
})

describe('the chat history', () => {
  const entry = (name: string | RegExp) => within(screen.getByRole('navigation', { name: 'Chats' })).getByRole('button', { name })
  const talk = async (user: ReturnType<typeof userEvent.setup>, text: string, answer: string) => {
    answers = [reply('chat', answer)]
    await say(user, text)
    await waitFor(() => expect(screen.getByText(answer)).toBeInTheDocument())
  }

  it('says what it is for while there is nothing in it, and has no menu of places to go', () => {
    renderHome()
    expect(within(screen.getByRole('navigation', { name: 'Chats' })).getByText(/kept here once you have said something/)).toBeInTheDocument()
    // the tasks are chosen from the message bar and with Droplet, not from the sidebar
    for (const name of [/Make an invoice/, /Build the brand/, /Get a logo/, /Shape the business idea/, /Write to a client/, /^Home$/, /Review and export/, /Assets/]) {
      expect(within(screen.getByRole('complementary', { name: 'Sidebar' })).queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('lists a conversation once something has been said in it, called by how it began', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'Help me name my business', 'Happy to.')
    expect(entry(/^Help me name my business/)).toHaveAttribute('aria-current', 'true')
  })

  it('keeps a conversation when a new one is started, and brings it back when it is opened', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'First question', 'First answer.')
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    expect(screen.queryByText('First answer.')).not.toBeInTheDocument()
    await talk(user, 'Second question', 'Second answer.')
    const items = within(screen.getByRole('navigation', { name: 'Chats' })).getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('.chatlist__title')?.textContent)).toEqual(['Second question', 'First question'])
    await user.click(entry(/^First question/))
    expect(screen.getByText('First answer.')).toBeInTheDocument()
    expect(screen.queryByText('Second answer.')).not.toBeInTheDocument()
  })

  it('carries on a conversation that was opened, in the same entry', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'First question', 'First answer.')
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    await user.click(entry(/^First question/))
    await talk(user, 'Follow up', 'Follow answer.')
    expect(within(screen.getByRole('navigation', { name: 'Chats' })).getAllByRole('listitem')).toHaveLength(1)
    expect((await loadChatsFor())[0].messages.map((item) => item.text)).toEqual(['First question', 'First answer.', 'Follow up', 'Follow answer.'])
  })

  it('forgets a conversation only when asked twice', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'First question', 'First answer.')
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    await talk(user, 'Second question', 'Second answer.')
    await user.click(screen.getByRole('button', { name: 'More for First question' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(screen.getByText('Delete this chat?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(within(screen.getByRole('navigation', { name: 'Chats' })).getAllByRole('listitem')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'More for First question' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(within(screen.getByRole('navigation', { name: 'Chats' })).getAllByRole('listitem')).toHaveLength(1)
    expect((await loadChatsFor()).map((chat) => chat.title)).toEqual(['Second question'])
  })

  it('starts a new conversation when the open one is deleted', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'Only question', 'Only answer.')
    await user.click(screen.getByRole('button', { name: 'More for Only question' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByText('Only answer.')).not.toBeInTheDocument()
    expect(await loadChatsFor()).toEqual([])
  })

  const seed = (count: number) =>
    saveChats(
      'duckstack',
      Array.from({ length: count }, (_, index) => ({
        id: `chat-${index + 1}`,
        title: `Chat ${index + 1}`,
        // chat 1 is the most recent
        updatedAt: new Date(2026, 9, 5, 12, 0, 0 - index).toISOString(),
        messages: [{ id: 1, from: 'you' as const, text: `Chat ${index + 1}`, }, { id: 2, from: 'droplet' as const, text: `Answer ${index + 1}` }],
      })),
    )
  const recent = () => within(screen.getByRole('navigation', { name: 'Chats' })).getAllByRole('listitem').map((item) => item.querySelector('.chatlist__title')?.textContent)

  it('lists only the eight most recent chats in the sidebar, with a way to see all of them', async () => {
    await seed(12)
    renderHome()
    await waitFor(() => expect(recent()).toEqual(['Chat 1', 'Chat 2', 'Chat 3', 'Chat 4', 'Chat 5', 'Chat 6', 'Chat 7', 'Chat 8']))
    expect(screen.getByRole('button', { name: 'See all chats' })).toBeInTheDocument()
  })

  it('offers no "See all" when everything is already listed', async () => {
    await seed(8)
    renderHome()
    await waitFor(() => expect(recent()).toHaveLength(8))
    expect(screen.queryByRole('button', { name: 'See all chats' })).not.toBeInTheDocument()
  })

  it('opens every chat in a dialog with a search, opens one from it and closes', async () => {
    const user = userEvent.setup()
    await seed(12)
    renderHome()
    await user.click(await screen.findByRole('button', { name: 'See all chats' }))
    const dialog = screen.getByRole('dialog', { name: 'All chats' })
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(12)
    await user.type(within(dialog).getByRole('searchbox', { name: 'Search chats' }), 'chat 11')
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: /^Chat 11/ }))
    expect(screen.getByText('Answer 11')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'All chats' })).not.toBeInTheDocument()
  })

  it('says when no chat matches the search, and closes on Escape', async () => {
    const user = userEvent.setup()
    await seed(10)
    renderHome()
    await user.click(await screen.findByRole('button', { name: 'See all chats' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'zebra')
    expect(screen.getByText(/No chats match/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'All chats' })).not.toBeInTheDocument()
  })

  it('can delete a chat from the full list, after a second press', async () => {
    const user = userEvent.setup()
    await seed(10)
    renderHome()
    await user.click(await screen.findByRole('button', { name: 'See all chats' }))
    const dialog = screen.getByRole('dialog', { name: 'All chats' })
    await user.click(within(dialog).getByRole('button', { name: 'More for Chat 10' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(screen.getByRole('dialog', { name: 'All chats' })).toBeInTheDocument()
    expect(await loadChatsFor()).toHaveLength(10)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await loadChatsFor()).toHaveLength(9)
  })

  it('keeps nothing for a conversation the founder has not spoken in', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await user.click(screen.getByRole('button', { name: 'Back to the full chat' }))
    expect(await loadChatsFor()).toEqual([])
  })

  it('is still there once a workspace is open, and does not lose the conversation going there: the sidebar steps back to icons, and the chat history icon opens the full list', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'Before the workspace', 'Noted.')
    await pickTask(user, /Build the brand/)
    expect(screen.getByText('Noted.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Chat history' }))
    const dialog = screen.getByRole('dialog', { name: 'All chats' })
    expect(within(dialog).getByRole('button', { name: /^Before the workspace/ })).toHaveAttribute('aria-current', 'true')
    expect(within(dialog).getByText('Open now')).toBeInTheDocument()
  })
})

describe('a question and suggested replies', () => {
  const asking = (message: string, question: string, replies: string[]) => ({ outcome: 'valid', answeredBy: 'base', turn: { task: 'chat', message, question, replies, actions: [], memoryUsed: [] } })

  it('shows the question after the answer, offers no reply buttons, and sends the founder\'s typed answer with the question in the history', async () => {
    const user = userEvent.setup()
    answers = [
      asking('Three ways to price:\n\n- **Cost plus**\n- **Value based**', 'Do you know your costs?', ['Yes, I know them', 'Not sure yet']),
      { outcome: 'valid', answeredBy: 'base', turn: { task: 'chat', message: 'Then start with cost plus.', actions: [], memoryUsed: [] } },
    ]
    renderHome()
    await say(user, 'How should I price my boxes?')
    await waitFor(() => expect(screen.getByText('Do you know your costs?')).toBeInTheDocument())
    expect(screen.getByText('Cost plus').tagName).toBe('STRONG')

    // suggested replies are turned off: the question is answered in the box
    expect(screen.queryByRole('button', { name: 'Not sure yet' })).toBeNull()
    await say(user, 'Not sure yet')
    await waitFor(() => expect(screen.getByText('Then start with cost plus.')).toBeInTheDocument())
    expect(asked[1].intent).toBe('Not sure yet')
    // the earlier answer reaches the model with its question, so "Not sure yet" has something to answer
    expect((asked[1] as { history?: { role: string; text: string }[] }).history?.at(-1)?.text).toContain('Do you know your costs?')
    // the replies went with the question that was answered
    expect(screen.queryByRole('button', { name: 'Not sure yet' })).toBeNull()
  })

  it('shows nothing of an answer it could not use, including its question', async () => {
    const user = userEvent.setup()
    answers = [{ outcome: 'valid', answeredBy: 'base', turn: { task: 'brand', message: 'Done.', question: 'Does it feel right?', actions: [{ type: 'select_colour', index: 9 }], memoryUsed: [] } }]
    renderHome()
    await pickTask(user, /Build the brand/)
    await say(user, 'Select colour 9')
    // the composer's own check refuses a colour that is not there, so the question is not shown for an answer nobody could use
    await waitFor(() => expect(screen.getByText(/I got an answer I could not use/)).toBeInTheDocument())
    expect(screen.queryByText('Does it feel right?')).toBeNull()
  })

  it('keeps the question in the saved chat, but not the replies', async () => {
    const user = userEvent.setup()
    answers = [asking('Start from your costs.', 'What does a box cost you?', ['I know', 'Not sure'])]
    renderHome()
    await say(user, 'Price help')
    await waitFor(() => expect(screen.getByText('What does a box cost you?')).toBeInTheDocument())
    const key = Object.keys(window.localStorage).find((name) => name.endsWith('-chats'))!
    const stored = JSON.parse(window.localStorage.getItem(key)!)
    expect(stored[0].messages.at(-1)).toMatchObject({ from: 'droplet', question: 'What does a box cost you?' })
    expect(JSON.stringify(stored)).not.toContain('Not sure')
  })
})

describe('the composer naming a chat', () => {
  const named = (message: string, title?: string) => ({ outcome: 'valid', answeredBy: 'base', turn: { task: 'chat', message, actions: [], memoryUsed: [], ...(title ? { title } : {}) } })
  const titles = () => within(screen.getByRole('navigation', { name: 'Chats' })).getAllByRole('listitem').map((item) => item.querySelector('.chatlist__title')?.textContent)

  it('lists the chat by the name the composer gave it, tidied, instead of the founder\'s first words', async () => {
    const user = userEvent.setup()
    answers = [named('Start from your costs.', '"Pricing gift boxes."')]
    renderHome()
    await say(user, 'hi, how should I price my boxes?')
    await waitFor(() => expect(screen.getByText('Start from your costs.')).toBeInTheDocument())
    expect(titles()).toEqual(['Pricing gift boxes'])
  })

  it('is called by how it began until the composer names it, and sends the name back once there is one', async () => {
    const user = userEvent.setup()
    answers = [named('Hello.'), named('Start from your costs.', 'Pricing gift boxes'), named('Then a margin.')]
    renderHome()
    await say(user, 'hi')
    await waitFor(() => expect(screen.getByText('Hello.')).toBeInTheDocument())
    expect(titles()).toEqual(['hi'])
    await user.keyboard('{Escape}')
    await say(user, 'how should I price my boxes?')
    await waitFor(() => expect(screen.getByText('Start from your costs.')).toBeInTheDocument())
    await say(user, 'and the margin?')
    await waitFor(() => expect(screen.getByText('Then a margin.')).toBeInTheDocument())
    expect((asked[0] as { chatTitle?: string }).chatTitle).toBeUndefined()
    expect((asked[1] as { chatTitle?: string }).chatTitle).toBeUndefined()
    expect((asked[2] as { chatTitle?: string }).chatTitle).toBe('Pricing gift boxes')
    expect(titles()).toEqual(['Pricing gift boxes'])
  })

  it('lets the composer rename the chat when the subject moves on', async () => {
    const user = userEvent.setup()
    answers = [named('One.', 'Pricing gift boxes'), named('Two.', 'Naming the business')]
    renderHome()
    await say(user, 'prices?')
    await waitFor(() => expect(screen.getByText('One.')).toBeInTheDocument())
    await say(user, 'actually, names')
    await waitFor(() => expect(screen.getByText('Two.')).toBeInTheDocument())
    expect(titles()).toEqual(['Naming the business'])
  })

  it('keeps the name when the chat is opened again, and a chat that was never named is still called by how it began', async () => {
    const user = userEvent.setup()
    answers = [named('Start from your costs.', 'Pricing gift boxes')]
    renderHome()
    await say(user, 'prices?')
    await waitFor(() => expect(screen.getByText('Start from your costs.')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    answers = [named('Hello.')]
    await say(user, 'hi there')
    await waitFor(() => expect(screen.getByText('Hello.')).toBeInTheDocument())
    expect(titles()).toEqual(['hi there', 'Pricing gift boxes'])
    await user.click(within(screen.getByRole('navigation', { name: 'Chats' })).getByRole('button', { name: /^Pricing gift boxes/ }))
    answers = [named('A margin of your choice.')]
    await say(user, 'and the margin?')
    await waitFor(() => expect(screen.getByText('A margin of your choice.')).toBeInTheDocument())
    expect((asked.at(-1) as { chatTitle?: string }).chatTitle).toBe('Pricing gift boxes')
  })
})

describe('the start of the page', () => {
  const home = (container: HTMLElement) => container.querySelector('.home')!

  it('is plain before anything has been said, and goes back to the page once it has', async () => {
    const user = userEvent.setup()
    const { container } = renderHome()
    expect(home(container)).toHaveAttribute('data-start')
    answers = [reply('chat', 'Hello.')]
    await say(user, 'Hi')
    expect(home(container)).not.toHaveAttribute('data-start')
    await waitFor(() => expect(screen.getByText('Hello.')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    expect(home(container)).toHaveAttribute('data-start')
  })

  it('is not plain behind a workspace', async () => {
    const user = userEvent.setup()
    const { container } = renderHome()
    await pickTask(user, /Build the brand/)
    expect(home(container)).not.toHaveAttribute('data-start')
  })
})

describe('the light while Droplet works', () => {
  it('is not shown over the conversation when there is no workspace', async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = () => resolve(new Response(JSON.stringify(reply('chat', 'Done.')), { status: 200, headers: { 'content-type': 'application/json' } })) })))
    const { container } = renderHome()
    await say(user, 'Hello')
    expect(container.querySelector('.glow')).toBeNull()
    release()
    await waitFor(() => expect(screen.getByText('Done.')).toBeInTheDocument())
  })

  // The blue light was taken out: nothing goes over the workspace while the composer only thinks. The loader shows only as a reply's changes land.
  it('is not shown over a workspace while the composer works on it any more', async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = () => resolve(new Response(JSON.stringify(reply('brand', 'Done.')), { status: 200, headers: { 'content-type': 'application/json' } })) })))
    const { container } = renderHome()
    await pickTask(user, /Build the brand/)
    await say(user, 'Warmer please')
    expect(container.querySelector('.glow')).toBeNull()
    expect(container.querySelector('.acting')).toBeNull()
    release()
    await waitFor(() => expect(screen.getByText('Done.')).toBeInTheDocument())
  })
})

describe('the board for shaping the business idea', () => {
  const toolbar = taskBar
  // The plus is among the options of the sticky note tool, which show while it is in hand.
  const addNote = async (user: ReturnType<typeof userEvent.setup>) => {
    const note = await screen.findByRole('button', { name: 'Note' })
    if (note.getAttribute('aria-pressed') !== 'true') await user.click(note)
    await user.click(await screen.findByRole('button', { name: 'Add a note to the middle of the view' }))
  }

  it('opens from the task menu without asking the model, and says nothing in the thread', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    expect(screen.getByRole('region', { name: 'Board' })).toBeInTheDocument()
    expect(asked).toHaveLength(0)
    expect(within(screen.getByRole('log', { name: 'Conversation' })).queryAllByRole('listitem')).toHaveLength(0)
  })

  it('has the board tools on the task bar, each with its name written out, in a fixed order, with nothing to add, remove or reset', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    const bar = within(toolbar()!)
    const names = ['Select', 'Sticky note', 'Shape', 'Text', 'Frame', 'Arrow', 'Templates']
    for (const name of names) expect(bar.getByRole('group', { name })).toBeInTheDocument()
    expect(bar.getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(names)
    // the label is on the bar itself: each tool's button has its name as text
    for (const label of ['Select', 'Note', 'Shape', 'Text', 'Frame', 'Arrow', 'Templates']) expect(bar.getByRole('button', { name: label })).toHaveTextContent(label)
    // the options of a tool are there while it is in hand
    expect(bar.queryByRole('radiogroup', { name: 'Colour of the next note' })).not.toBeInTheDocument()
    await user.click(bar.getByRole('button', { name: 'Note' }))
    expect(bar.getByRole('radiogroup', { name: 'Colour of the next note' })).toBeInTheDocument()
    await user.click(bar.getByRole('button', { name: 'Shape' }))
    expect(bar.getByRole('radiogroup', { name: 'Kind of the next shape' })).toBeInTheDocument()
    await user.click(bar.getByRole('button', { name: 'Arrow' }))
    expect(bar.getByRole('radiogroup', { name: 'Line of the next arrow' })).toBeInTheDocument()
    // nothing to add or take away, and no layout to reset
    expect(screen.queryByRole('button', { name: /Add or remove a tool/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reset layout/ })).not.toBeInTheDocument()
  })

  it('keeps the board while another workspace is shown, and brings it back as it was', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await addNote(user)
    await user.keyboard('Gift boxes{Escape}')
    await pickTask(user, /Build the brand/)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Board' })).not.toBeInTheDocument())
    await pickTask(user, /Shape the business idea/)
    expect(await screen.findByRole('region', { name: 'Board' })).toBeInTheDocument()
    expect(screen.getByText('Gift boxes')).toBeInTheDocument()
  })

  it('puts a template on the board from the toolbar, which is saved with it and comes back as it was', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await user.click(await screen.findByRole('button', { name: 'Templates' }))
    await user.click(screen.getByRole('menuitem', { name: /^Brain dump/ }))
    expect(screen.getByText('Brain dump: every idea, however rough', { selector: '.frame__title' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-guide]').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const saved = (await loadBoard('duckstack'))!
    expect(saved.items.some((item) => item.kind === 'frame' && item.group?.startsWith('brain_dump:'))).toBe(true)
    expect(saved.items.some((item) => item.kind === 'note' && item.hint === 'An idea, however rough')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Back to the full chat' }))
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    await pickTask(user, /Shape the business idea/)
    expect(await screen.findByText('Brain dump: every idea, however rough', { selector: '.frame__title' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-guide]').length).toBeGreaterThan(0)
  })

  it('saves from the header only when Save is pressed', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await addNote(user)
    await user.keyboard('A name idea{Escape}')
    expect(await loadBoard('duckstack')).toBeNull()
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect((await loadBoard('duckstack'))?.items.map((item) => ('text' in item ? item.text : null))).toEqual(['A name idea'])
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
  })

  it('opens with what was saved', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await addNote(user)
    await user.keyboard('Remembered{Escape}')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Back to the full chat' }))
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    await pickTask(user, /Shape the business idea/)
    expect(await screen.findByText('Remembered')).toBeInTheDocument()
  })

  it('closes at once with Back to the full chat when nothing has been put on it', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await user.click(screen.getByRole('button', { name: 'Back to the full chat' }))
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument()
  })

  it('asks first, in the thread, when there are notes that are not saved, and saves the board from the button there', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await addNote(user)
    await user.keyboard('Not saved yet{Escape}')
    await user.click(screen.getByRole('button', { name: 'Back to the full chat' }))
    expect(screen.getByText(/You have unsaved changes in the board/)).toBeInTheDocument()
    expect(toolbar()).toBeInTheDocument()
    expect(await loadBoard('duckstack')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save the board' }))
    expect((await loadBoard('duckstack'))?.items).toHaveLength(1)
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(screen.getByText(/I saved the board\. Everything is saved/)).toBeInTheDocument()
  })

  it('closes without saving when asked to', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await addNote(user)
    await user.keyboard('Throw away{Escape}')
    await user.click(screen.getByRole('button', { name: 'Back to the full chat' }))
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }))
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(await loadBoard('duckstack')).toBeNull()
  })

  it('asks about the board and the palette together when both have changes', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await pickTask(user, /Shape the business idea/)
    await addNote(user)
    await user.keyboard('Both{Escape}')
    await user.click(screen.getByRole('button', { name: 'Back to the full chat' }))
    expect(screen.getByText(/the brand palette and the board/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save the board' }))
    expect(screen.getByText(/The palette still has unsaved changes/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save the board' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save the palette' }))
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
  })

  it('does not call the model until the founder sends a message: nothing on the board asks it in the background', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await addNote(user)
    await user.keyboard('Something{Escape}')
    await user.click(await screen.findByRole('button', { name: 'Templates' }))
    await user.click(screen.getByRole('menuitem', { name: /^Brain dump/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(asked).toHaveLength(0)
  })

  it('starts the next message with a divider when it is sent in the board after another workspace', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    answers = [reply('chat', 'Hi.')]
    await say(user, 'Hello')
    await waitFor(() => expect(screen.getByText('Hi.')).toBeInTheDocument())
    await pickTask(user, /Shape the business idea/)
    answers = [reply('chat', 'Here.')]
    await say(user, 'Now?')
    await waitFor(() => expect(screen.getByText('Here.')).toBeInTheDocument())
    expect(screen.getByText('Switched workspace to Business idea')).toBeInTheDocument()
  })
})

describe('the AI on the board', () => {
  // The plus is among the options of the sticky note tool, which show while it is in hand.
  const addNote = async (user: ReturnType<typeof userEvent.setup>) => {
    const note = await screen.findByRole('button', { name: 'Note' })
    if (note.getAttribute('aria-pressed') !== 'true') await user.click(note)
    await user.click(await screen.findByRole('button', { name: 'Add a note to the middle of the view' }))
  }
  const withNote = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    await addNote(user)
    await user.keyboard(`${text}{Escape}`)
  }
  const pink = () => [...document.querySelectorAll<HTMLElement>('.note[data-colour="pink"]')]
  const toolbar = taskBar

  it('offers a few ways in on an empty board, and sends the one that is pressed as the founder\'s own request', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    expect(screen.getByLabelText('Describe what you need')).toHaveAttribute('placeholder', expect.stringMatching(/start the board/))
    const suggestions = await screen.findByRole('group', { name: 'Suggestions' })
    expect(suggestions).toHaveTextContent('Brainstorm namesCustomer templateInterview me')
    answers = [reply('chat', 'Here are some.')]
    await user.click(within(suggestions).getByRole('button', { name: 'Brainstorm names' }))
    await screen.findByText('Here are some.')
    expect(asked[0].intent).toBe('Brainstorm some name ideas for my business')
  })

  it('reads the selection: the field, a chip with a cross, and an Ask Droplet button that sends a suggestion about it', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Gift boxes for offices')
    // the note is selected after it was written
    await user.click(screen.getByText('Gift boxes for offices'))
    expect(screen.getByLabelText('Describe what you need')).toHaveAttribute('placeholder', 'Ask about the selected note')
    expect(screen.getByRole('group', { name: 'Suggestions' })).toHaveTextContent('1 note selected')
    answers = [reply('ideation', 'Two ideas.', [{ type: 'add_note', text: 'Corporate hampers', near: 'n1' }])]
    await user.click(screen.getByRole('button', { name: 'Ask Droplet about this note' }))
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    await screen.findByText('Two ideas.')
    expect(asked[0].intent).toBe('Expand this note into a few related ideas')
    expect(asked[0]).toMatchObject({ view: 'board' })
    expect(pink()).toHaveLength(1)
    // the reply comes back with its receipt, like any other
    expect(screen.getByText(/Changed on the board/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear the selection' }))
    expect(screen.queryByText('1 note selected')).not.toBeInTheDocument()
  })

  it('is shown the board, by reference, when it is on screen, and not the palette or the invoice', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Gift boxes for offices')
    answers = [reply('chat', 'Noted.')]
    await say(user, 'What do you think?')
    await waitFor(() => expect(screen.getByText('Noted.')).toBeInTheDocument())
    const sent = asked[0] as unknown as { view?: string; board?: { items: { ref: string; kind: string; text?: string }[]; selection: string[]; view: { x: number; y: number } }; workspace?: unknown; invoice?: unknown }
    expect(sent.view).toBe('board')
    expect(sent.board?.items.find((item) => item.ref === 'n1')).toMatchObject({ kind: 'note', text: 'Gift boxes for offices' })
    expect(sent.board?.view).toBeDefined()
    expect(sent.workspace).toBeUndefined()
    expect(sent.invoice).toBeUndefined()
  })

  it('puts the notes it is asked for on the board, pink, with its name on them, and says what to do with them', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Gift boxes for offices')
    answers = [reply('ideation', 'I added two ideas beside your note.', [{ type: 'add_note', text: 'Corporate hampers', near: 'n1', connect: true }, { type: 'add_note', text: 'Thank-you boxes', near: 'n1', connect: true }])]
    await say(user, 'Give me some related ideas')
    await waitFor(() => expect(screen.getByText(/I added two ideas beside your note/)).toBeInTheDocument())
    expect(pink()).toHaveLength(2)
    expect(pink().map((note) => note.textContent)).toEqual([expect.stringContaining('Corporate hampers'), expect.stringContaining('Thank-you boxes')])
    for (const note of pink()) expect(within(note).getByText('Droplet')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-kind="connector"]')).toHaveLength(2)
    expect(screen.getByText(/My notes are pink\. Select one to keep it as yours, or delete it\./)).toBeInTheDocument()
  })

  it('says what pink means only the first time', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'A note')
    answers = [reply('ideation', 'First batch.', [{ type: 'add_note', text: 'One' }])]
    await say(user, 'ideas')
    await waitFor(() => expect(screen.getByText(/First batch\./)).toBeInTheDocument())
    answers = [reply('ideation', 'Second batch.', [{ type: 'add_note', text: 'Two' }])]
    await say(user, 'more')
    await waitFor(() => expect(screen.getByText(/Second batch\./)).toBeInTheDocument())
    expect(screen.getAllByText(/My notes are pink/)).toHaveLength(1)
    expect(pink()).toHaveLength(2)
  })

  it('is one step: one Undo takes back everything it did', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'A note')
    answers = [reply('ideation', 'Done.', [{ type: 'add_note', text: 'One', near: 'n1', connect: true }, { type: 'add_note', text: 'Two', near: 'n1', connect: true }, { type: 'add_note', text: 'Three' }])]
    await say(user, 'ideas please')
    await waitFor(() => expect(pink()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(pink()).toHaveLength(0)
    expect(document.querySelectorAll('[data-kind="connector"]')).toHaveLength(0)
    expect(screen.getByText('A note')).toBeInTheDocument()
  })

  it('leaves the founder\'s own notes as they were', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Mine')
    const mine = () => document.querySelector<HTMLElement>('.note:not([data-colour="pink"])')!
    const before = { left: mine().style.left, top: mine().style.top, colour: mine().dataset.colour, text: mine().textContent }
    answers = [reply('ideation', 'Done.', [{ type: 'add_note', text: 'Another', near: 'n1' }])]
    await say(user, 'one more idea')
    await waitFor(() => expect(pink()).toHaveLength(1))
    expect({ left: mine().style.left, top: mine().style.top, colour: mine().dataset.colour, text: mine().textContent }).toEqual(before)
  })

  it('asks in the chat before deleting a note of the founder\'s, and deletes it only on Delete', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Gift boxes for offices')
    answers = [reply('ideation', 'I would take that one out. I am asking you first.', [{ type: 'remove', things: ['n1'] }])]
    await say(user, 'Delete my note')
    expect(await screen.findByText(/Delete 1 of your notes\?/)).toBeInTheDocument()
    expect(screen.getByText('Gift boxes for offices')).toBeInTheDocument()
    expect(screen.getByText(/Nothing is deleted until you say yes/)).toBeInTheDocument()
    await user.click(within(screen.getByRole('log', { name: 'Conversation' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Gift boxes for offices')).not.toBeInTheDocument())
    expect(screen.getByText(/Undo in the header brings it back/)).toBeInTheDocument()
    // the question is the app's own note, so it is not sent to the composer afterwards, and the buttons are gone
    expect(screen.queryByRole('button', { name: 'Keep them' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Gift boxes for offices')).toBeInTheDocument()
  })

  it('leaves the note alone on Keep them', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Gift boxes for offices')
    answers = [reply('ideation', 'Asking first.', [{ type: 'remove', things: ['n1'] }])]
    await say(user, 'Delete my note')
    await user.click(await screen.findByRole('button', { name: 'Keep them' }))
    expect(screen.getByText('Gift boxes for offices')).toBeInTheDocument()
    expect(screen.getByText('Okay, I left them as they are.')).toBeInTheDocument()
  })

  it('suggests new words for a note of the founder\'s, and changes it only on Accept, and not if they changed it meanwhile', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Gift boxes')
    answers = [reply('ideation', 'Here is a sharper version.', [{ type: 'edit_note', note: 'n1', text: 'Corporate gift boxes' }])]
    await say(user, 'Reword my note')
    expect(await screen.findByText(/Now: “Gift boxes”\. Suggested: “Corporate gift boxes”/)).toBeInTheDocument()
    expect(screen.getByText('Gift boxes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(screen.getByText('Corporate gift boxes')).toBeInTheDocument())
    expect(screen.getByText(/Undo in the header takes it back/)).toBeInTheDocument()
  })

  it('does not send the proposal\'s question to the composer as part of the conversation', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Gift boxes for offices')
    answers = [reply('ideation', 'Asking first.', [{ type: 'remove', things: ['n1'] }]), reply('chat', 'Fine.')]
    await say(user, 'Delete my note')
    await screen.findByText(/Delete 1 of your notes\?/)
    await say(user, 'Never mind')
    await screen.findByText('Fine.')
    expect(JSON.stringify(asked[1])).not.toMatch(/Nothing is deleted until you say yes/)
  })

  it('lets the founder keep a note as their own, and the note is then no longer pink or Droplet\'s', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'A note')
    answers = [reply('ideation', 'Done.', [{ type: 'add_note', text: 'An idea', near: 'n1' }])]
    await say(user, 'an idea')
    await waitFor(() => expect(pink()).toHaveLength(1))
    await user.click(pink()[0])
    await user.click(screen.getByRole('button', { name: 'Keep as mine' }))
    expect(pink()).toHaveLength(0)
    expect(screen.queryByText('Droplet', { selector: '.note__author' })).not.toBeInTheDocument()
    expect(screen.getByText('An idea')).toBeInTheDocument()
  })

  it('lets the founder dismiss one with Delete, and the others stay', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'A note')
    answers = [reply('ideation', 'Done.', [{ type: 'add_note', text: 'One', near: 'n1' }, { type: 'add_note', text: 'Two', near: 'n1' }])]
    await say(user, 'ideas')
    await waitFor(() => expect(pink()).toHaveLength(2))
    await user.click(pink()[0])
    await user.keyboard('{Delete}')
    expect(pink()).toHaveLength(1)
  })

  it('refuses an answer that names a thing that is not on the board, and changes nothing', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'A note')
    answers = [reply('ideation', 'Done.', [{ type: 'add_note', text: 'x', near: 'n99' }])]
    await say(user, 'a note near n99')
    await waitFor(() => expect(screen.getByText(/I got an answer I could not use/)).toBeInTheDocument())
    expect(pink()).toHaveLength(0)
  })

  it('opens the board and asks again with it in front of the composer when the founder asks to brainstorm and a palette is open', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    answers = [opening('ideation', 'I am opening the board.', 'brainstorm on a board'), reply('ideation', 'Here are some ideas.', [{ type: 'add_note', text: 'An idea' }])]
    await say(user, 'I want to brainstorm on a board')
    await waitFor(() => expect(screen.getByText(/Here are some ideas/)).toBeInTheDocument())
    expect(asked).toHaveLength(2)
    expect((asked[0] as unknown as { view?: string }).view).toBe('brand')
    expect((asked[1] as unknown as { view?: string }).view).toBe('board')
    expect(await screen.findByRole('region', { name: 'Board' })).toBeInTheDocument()
    expect(pink()).toHaveLength(1)
  })

  it('does not open the board for advice about names, which carries a question', async () => {
    const user = userEvent.setup()
    renderHome()
    answers = [{ outcome: 'valid', answeredBy: 'base', turn: { task: 'ideation', message: 'Short names work best.', question: 'What do you sell?', actions: [], memoryUsed: [] } }]
    await say(user, 'How should I think about naming my business?')
    await waitFor(() => expect(screen.getByText('Short names work best.')).toBeInTheDocument())
    expect(asked).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'Board' })).not.toBeInTheDocument()
  })

  it('takes a founder who is on the board to the invoice when that is what they ask for', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    answers = [opening('invoice', 'Opening the invoice.', 'Invoice them for 12 gift boxes'), reply('invoice', 'Added the line.', [{ type: 'add_line', description: 'Gift box', quantity: 12, unitPrice: '450' }])]
    await say(user, 'Invoice them for 12 gift boxes at 450')
    await waitFor(() => expect(screen.getByText(/Added the line/)).toBeInTheDocument())
    expect((asked[0] as unknown as { view?: string }).view).toBe('board')
    expect((asked[1] as unknown as { view?: string }).view).toBe('invoice')
    expect(toolbar()).toBeInTheDocument()
  })

  it('fills the prompts of a template the founder put on the board, as notes by Droplet in the same places', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await user.click(await screen.findByRole('button', { name: 'Templates' }))
    await user.click(screen.getByRole('menuitem', { name: /^Customer and problem/ }))
    expect(document.querySelectorAll('[data-guide]')).toHaveLength(6)
    answers = [reply('ideation', 'I filled two of them.', [{ type: 'fill_prompt', note: 'n1', text: 'Busy office managers' }, { type: 'fill_prompt', note: 'n2', text: 'Through LinkedIn' }])]
    await say(user, 'fill in what you can for corporate gifts')
    await waitFor(() => expect(screen.getByText(/I filled two of them/)).toBeInTheDocument())
    expect(pink()).toHaveLength(2)
    expect(document.querySelectorAll('[data-guide]')).toHaveLength(4)
  })

  it('puts a template on the board when asked, with its prompts filled in', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    answers = [reply('ideation', 'Added it.', [{ type: 'add_template', template: 'name_ideas', fill: ['Kindred Boxes', 'Maker Crate'] }])]
    await say(user, 'set me up to brainstorm names')
    await waitFor(() => expect(screen.getByText(/Added it/)).toBeInTheDocument())
    expect(screen.getByText('Name ideas', { selector: '.frame__title' })).toBeInTheDocument()
    expect(pink().map((note) => note.textContent)).toEqual([expect.stringContaining('Kindred Boxes'), expect.stringContaining('Maker Crate')])
  })
})

describe('with storage that takes its time', () => {
  let before: DocumentStorage
  afterEach(() => setDocumentStorage(before))

  it('opens a workspace once what was saved has been read, and only once if the task is chosen twice meanwhile', async () => {
    const slow = slowMemoryStorage(25)
    before = setDocumentStorage(slow.driver)
    const user = userEvent.setup()
    renderHome()
    await waitFor(() => expect(slow.calls).toContain('read duckstack/chats'))
    await user.click(screen.getByRole('button', { name: 'Choose a task' }))
    const menuitem = await screen.findByRole('menuitem', { name: /Build the brand/ })
    await user.click(menuitem)
    // chosen again before the first has arrived
    // The bar moves into the side panel when the workspace arrives, so a press made in that moment can land on the bar that is going: press again until
    // the menu is there.
    const again = await waitFor(async () => {
      await user.click(screen.getByRole('button', { name: 'Choose a task' }))
      return screen.getByRole('menuitem', { name: /Build the brand/ })
    })
    await user.click(again)
    expect(await screen.findByRole('region', { name: 'Palette' })).toBeInTheDocument()
    await waitFor(() => expect(slow.calls.filter((call) => call === 'read duckstack/palette').length).toBeGreaterThanOrEqual(1))
    expect(screen.getAllByRole('region', { name: 'Palette' })).toHaveLength(1)
  })

  it('keeps conversations in order when they are saved and read slowly: a chat said, then a new one, then the first opened', async () => {
    const slow = slowMemoryStorage(15)
    before = setDocumentStorage(slow.driver)
    const user = userEvent.setup()
    renderHome()
    answers = [reply('chat', 'First answer.')]
    await say(user, 'First question')
    await waitFor(() => expect(screen.getByText('First answer.')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    answers = [reply('chat', 'Second answer.')]
    await say(user, 'Second question')
    await waitFor(() => expect(screen.getByText('Second answer.')).toBeInTheDocument())
    const nav = () => within(screen.getByRole('navigation', { name: 'Chats' }))
    await waitFor(() => expect(nav().getAllByRole('listitem').map((item) => item.querySelector('.chatlist__title')?.textContent)).toEqual(['Second question', 'First question']))
    await user.click(nav().getByRole('button', { name: /^First question/ }))
    await waitFor(() => expect(screen.getByText('First answer.')).toBeInTheDocument())
    expect(screen.queryByText('Second answer.')).not.toBeInTheDocument()
    // both were kept, whole
    await waitFor(async () => expect((await loadChatsFor()).map((chat) => chat.title).sort()).toEqual(['First question', 'Second question']))
  })

  it('saves the palette through the storage when asked, and does not touch this browser\'s', async () => {
    const slow = slowMemoryStorage(5)
    before = setDocumentStorage(slow.driver)
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    await user.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(slow.documents.has('duckstack/palette')).toBe(true))
    expect(window.localStorage.getItem('droplet-project-duckstack-palette')).toBeNull()
  })
})

// Droplet guides first: nothing opens until the founder asks for it or agrees, and a plan or a table can be shown in the chat.
describe('guiding the founder', () => {
  const plan = {
    type: 'checklist',
    title: 'Your plan',
    numbered: true,
    items: [
      { label: 'Settle the name', detail: 'DuckStack is yours.', step: 'name' },
      { label: 'Brand values and offer', step: 'values' },
      { label: 'Get a logo', step: 'logo' },
    ],
  }
  const planReply = { outcome: 'valid', answeredBy: 'base', turn: { task: 'chat', message: 'Here is the order I would go in.', question: 'Shall we start with the name?', blocks: [plan], actions: [], memoryUsed: [] } }

  it('opens nothing for a founder who only says what they want to build: the reply is a conversation and a question', async () => {
    const user = userEvent.setup()
    answers = [{ outcome: 'valid', answeredBy: 'base', turn: { task: 'chat', message: 'DuckStack! Lovely name.', question: 'How far along are you?', replies: ['Just an idea'], actions: [], memoryUsed: [] } }]
    renderHome()
    await say(user, 'I want to create a dev studio called DuckStack')
    await waitFor(() => expect(screen.getByText('How far along are you?')).toBeInTheDocument())
    expect(asked).toHaveLength(1)
    expect(taskBar()).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Board' })).not.toBeInTheDocument()
  })

  it('refuses a reply that opens a palette without a quote from the founder, so no workspace opens and nothing odd reaches the thread', async () => {
    const user = userEvent.setup()
    const palette = { type: 'set_palette', colours: [{ hex: '#111111', name: 'A', rationale: 'x' }, { hex: '#EEEEEE', name: 'B', rationale: 'x' }, { hex: '#336699', name: 'C', rationale: 'x' }], reason: 'Colours.' }
    answers = [{ outcome: 'valid', answeredBy: 'base', turn: { task: 'brand', message: 'Here are colours.', actions: [palette], memoryUsed: [] } }]
    renderHome()
    await say(user, 'I want to create a dev studio called DuckStack')
    await waitFor(() => expect(screen.getByText(/I got an answer I could not use/)).toBeInTheDocument())
    expect(taskBar()).not.toBeInTheDocument()
    expect(screen.queryByText('Here are colours.')).not.toBeInTheDocument()
  })

  it('tells the composer where the project is on the journey with every request, and nothing private', async () => {
    const user = userEvent.setup()
    await saveMemory('duckstack', withIdea(emptyMemory(), 'name', 'DuckStack', '2026-10-06T10:00'))
    answers = [reply('chat', 'Hello.')]
    renderHome()
    await say(user, 'Hi')
    await waitFor(() => expect(asked).toHaveLength(1))
    expect((asked[0] as unknown as { project: unknown }).project).toMatchObject({ businessName: 'DuckStack', hasPalette: false, invoices: 0, clients: 0 })
  })

  it('shows a plan as a checklist under the words, with the question after it', async () => {
    const user = userEvent.setup()
    answers = [planReply]
    renderHome()
    await say(user, 'Not much yet, just the name')
    const list = await screen.findByRole('region', { name: 'Your plan' })
    expect(within(list).getAllByRole('checkbox')).toHaveLength(3)
    expect(within(list).getByText('DuckStack is yours.')).toBeInTheDocument()
    expect(screen.getByText('Shall we start with the name?')).toBeInTheDocument()
    // a step with a workspace has an Open button, and the logo, which Droplet cannot make, says so instead
    expect(within(list).getByRole('button', { name: 'Open Settle the name' })).toBeInTheDocument()
    expect(within(list).queryByRole('button', { name: 'Open Get a logo' })).not.toBeInTheDocument()
    expect(within(list).getByText('Made outside Droplet')).toBeInTheDocument()
  })

  it('ticks the steps the project holds, leaves them locked, and lets the founder tick the rest, kept with the saved chat', async () => {
    const user = userEvent.setup()
    await saveMemory('duckstack', withIdea(emptyMemory(), 'name', 'DuckStack', '2026-10-06T10:00'))
    answers = [planReply]
    renderHome()
    await say(user, 'Not much yet')
    const list = await screen.findByRole('region', { name: 'Your plan' })
    const boxes = within(list).getAllByRole('checkbox')
    await waitFor(() => expect(boxes[0]).toBeChecked())
    expect(boxes[0]).toBeDisabled()
    expect(boxes[1]).not.toBeChecked()
    await user.click(boxes[2])
    expect(boxes[2]).toBeChecked()
    await waitFor(async () => expect((await loadChatsFor())[0].messages.find((item) => item.blocks)?.checks).toEqual({ '0:2': true }))
  })

  it('tells the composer what a plan said and what was ticked, so it can build on it', async () => {
    const user = userEvent.setup()
    answers = [planReply, reply('chat', 'Great.')]
    renderHome()
    await say(user, 'Not much yet')
    const list = await screen.findByRole('region', { name: 'Your plan' })
    await user.click(within(list).getAllByRole('checkbox')[2])
    await say(user, 'Ok')
    await waitFor(() => expect(asked).toHaveLength(2))
    const history = (asked[1] as unknown as { history: { role: string; text: string }[] }).history
    const said = history.find((item) => item.role === 'droplet')!.text
    expect(said).toContain('[Plan "Your plan": 1. Settle the name; 2. Brand values and offer; 3. Get a logo (done)]')
    expect(said.trim().endsWith('Shall we start with the name?')).toBe(true)
  })

  it('opens a workspace when the founder presses Open on a plan step: that is asking outright, in the words the composer expects', async () => {
    const user = userEvent.setup()
    answers = [planReply, reply('ideation', 'Here it is. What does DuckStack do?')]
    renderHome()
    await say(user, 'Not much yet')
    await user.click(await screen.findByRole('button', { name: 'Open Settle the name' }))
    expect(await screen.findByRole('region', { name: 'Board' })).toBeInTheDocument()
    await screen.findByText(/Here it is\. What does DuckStack do\?/)
    // opened in code before the composer is asked, so it is asked once, with the board on screen: no round trip to open it
    expect(asked).toHaveLength(2)
    expect(asked[1]).toMatchObject({ view: 'board', open: ['board'], intent: 'Open the business idea board' })
  })

  it('shows a table, with the first column naming the row', async () => {
    const user = userEvent.setup()
    answers = [{ outcome: 'valid', answeredBy: 'base', turn: { task: 'chat', message: 'Side by side:', blocks: [{ type: 'table', title: 'Name ideas', columns: ['Name', 'Feel'], rows: [['DuckStack', 'Playful'], ['Pond', 'Calm']] }], actions: [], memoryUsed: [] } }]
    renderHome()
    await say(user, 'Compare some names')
    const table = await screen.findByRole('table', { name: 'Name ideas' })
    expect(within(table).getByRole('rowheader', { name: 'DuckStack' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: 'Calm' })).toBeInTheDocument()
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Name', 'Feel'])
  })
})

// A reply that searched the web: shown as the model gave it, with the pages it drew on and Google's suggestions under it.
describe('a reply that searched the web', () => {
  const grounding = {
    queries: ['CIPC company registration fee'],
    sources: [{ title: 'cipc.co.za', url: 'https://www.cipc.co.za/fees' }],
    suggestions: '<a class="chip" href="https://www.google.com/search?q=cipc">cipc fee</a>',
  }

  it('shows the sources as links that open in a new tab, and Google\'s suggestions in a sandboxed frame with no scripts', async () => {
    const user = userEvent.setup()
    answers = [{ outcome: 'valid', answeredBy: 'base', grounding, turn: { task: 'chat', message: 'Registering a company with CIPC costs R175 at the moment.', question: 'Shall we look at what to register first?', actions: [], memoryUsed: [] } }]
    renderHome()
    await say(user, 'What does it cost to register with CIPC?')
    const link = await screen.findByRole('link', { name: 'cipc.co.za' })
    expect(link).toHaveAttribute('href', 'https://www.cipc.co.za/fees')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const frame = screen.getByTitle('Google Search suggestions')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(frame.getAttribute('srcdoc')).toContain('cipc fee')
    expect(frame.getAttribute('srcdoc')).toContain('<base target="_blank">')
  })

  it('keeps the app\'s own notes out of the grounded message, in a note of their own', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    answers = [{ outcome: 'valid', answeredBy: 'base', grounding, turn: { task: 'ideation', message: 'I added a note with what I found.', actions: [{ type: 'add_note', text: 'CIPC fee is about R175' }], memoryUsed: [] } }]
    await say(user, 'Add what CIPC charges to the board')
    const grounded = (await screen.findByText('I added a note with what I found.')).closest('li')!
    // the first pink note brings the app's note on what pink means: it is a message of its own, not mixed into the grounded answer
    expect(grounded.textContent).not.toMatch(/My notes are pink/)
    expect(await screen.findByText(/My notes are pink/)).toBeInTheDocument()
  })

  it('keeps what it drew on with the saved chat, so the sources show again when the chat is opened', async () => {
    const user = userEvent.setup()
    answers = [{ outcome: 'valid', answeredBy: 'base', grounding, turn: { task: 'chat', message: 'About R175.', actions: [], memoryUsed: [] } }]
    renderHome()
    await say(user, 'What does CIPC charge?')
    await screen.findByRole('link', { name: 'cipc.co.za' })
    await waitFor(async () => expect((await loadChatsFor())[0].messages.find((item) => item.from === 'droplet')?.grounding).toEqual(grounding))
  })
})

describe('the screen while Droplet works', () => {
  it('puts nothing over the workspace while Droplet is only thinking: no blue light and no loader', async () => {
    const user = userEvent.setup()
    let answer: (body: unknown) => void = () => undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { method?: string; body: string }) => {
        if (init.method === 'GET') return new Response(JSON.stringify({ allowance: allowanceNow }), { status: 200 })
        const sent = JSON.parse(init.body) as { kind?: string }
        if (sent.kind) return new Response(JSON.stringify({ kind: sent.kind, answeredBy: 'base', summary: null, digest: null }), { status: 200 })
        return new Promise<Response>((resolve) => {
          answer = (body) => resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))
        })
      }),
    )
    const { container } = renderHome()
    await pickTask(user, /Make an invoice/)
    await say(user, 'Bill Karoo Candles')
    expect(await screen.findByText(/Reading your message/)).toBeInTheDocument()
    expect(container.querySelector('.acting')).toBeNull()
    expect(container.querySelector('.glow')).toBeNull()
    answer(reply('invoice', 'Done.', [{ type: 'set_client', name: 'Karoo Candles' }]))
    await screen.findByText('Done.')
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Karoo Candles')
    await waitFor(() => expect(container.querySelector('.acting')).toBeNull())
  })
})

describe('Guide mode', () => {
  beforeEach(() => useWorkMode.setState({ mode: 'guide' }))

  const continueOn = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Continue' }))
  const onStep = (title: string) => expect(screen.getByRole('region', { name: title })).toBeInTheDocument()

  it('opens the invoice one step at a time, with the page beside it and the parts on the task bar', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Make an invoice/)
    expect(await screen.findByText('Step 1 of 6')).toBeInTheDocument()
    onStep('Your business')
    expect(screen.getByRole('region', { name: 'The invoice' })).toHaveTextContent('INV-0001')
    // the steps ahead are shown, but cannot be skipped to
    const steps = within(screen.getByRole('group', { name: 'Parts of the invoice' })).getAllByRole('button')
    expect(steps.map((step) => step.querySelector('.taskbar__label')?.textContent)).toEqual(['Business', 'VAT', 'Client', 'Items', 'Details', 'Review'])
    expect(steps[0]).toHaveAttribute('aria-current', 'step')
    expect(steps[2]).toHaveAttribute('aria-disabled', 'true')
  })

  it('does not move on while the step is missing something required, and says what', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Make an invoice/)
    await screen.findByText('Step 1 of 6')
    await continueOn(user)
    expect(screen.getByRole('alert')).toHaveTextContent('Add your business name.')
    onStep('Your business')
    await user.type(screen.getByLabelText('Business name'), 'Kindred Gifting')
    // what was missing goes as soon as it is filled in
    expect(screen.getByRole('alert')).not.toHaveTextContent('Add your business name.')
    await continueOn(user)
    expect(await screen.findByText('Step 2 of 6')).toBeInTheDocument()
    onStep('VAT')
    // Back, and forward again from the row of steps, as far as the founder got
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Step 1 of 6')).toBeInTheDocument()
    await user.click(within(screen.getByRole('group', { name: 'Parts of the invoice' })).getByRole('button', { name: /^VAT/ }))
    expect(await screen.findByText('Step 2 of 6')).toBeInTheDocument()
  })

  it('tells the composer which step is on screen', async () => {
    const user = userEvent.setup()
    answers = [reply('invoice', 'Who is it for?')]
    renderHome()
    await pickTask(user, /Make an invoice/)
    await screen.findByText('Step 1 of 6')
    await say(user, 'help me with this')
    await screen.findByText('Who is it for?')
    expect(asked[0]).toMatchObject({ view: 'invoice', guide: { step: 'business', position: 1, of: 6 } })
  })

  it('tells the composer nothing about a guide in Workspace mode', async () => {
    const user = userEvent.setup()
    useWorkMode.setState({ mode: 'workspace' })
    answers = [reply('invoice', 'Who is it for?')]
    renderHome()
    await pickTask(user, /Make an invoice/)
    await say(user, 'help me with this')
    await screen.findByText('Who is it for?')
    expect(asked[0]).not.toHaveProperty('guide')
  })

  it('shows what the composer fills in, on the step it belongs to', async () => {
    const user = userEvent.setup()
    answers = [reply('invoice', 'Added.', [{ type: 'set_client', name: 'Karoo Candles' }])]
    renderHome()
    await pickTask(user, /Make an invoice/)
    await screen.findByText('Step 1 of 6')
    await say(user, 'It is for Karoo Candles')
    await screen.findByText('Added.')
    expect(screen.getByRole('region', { name: 'The invoice' })).toHaveTextContent('Karoo Candles')
  })

  it('goes to the step Droplet changed, and Show me marks the field it changed even after the founder has moved away', async () => {
    const user = userEvent.setup()
    answers = [reply('invoice', 'I set the client.', [{ type: 'set_client', name: 'Niel Pretorius' }])]
    renderHome()
    await pickTask(user, /Make an invoice/)
    await screen.findByText('Step 1 of 6')
    await say(user, 'It is for Niel Pretorius')
    await screen.findByText('I set the client.')
    // the change is shown where it can be edited
    expect(await screen.findByText('Step 3 of 6')).toBeInTheDocument()
    expect(screen.getByLabelText('Client or company name')).toHaveValue('Niel Pretorius')
    await user.click(within(screen.getByRole('group', { name: 'Parts of the invoice' })).getByRole('button', { name: /^Business/ }))
    expect(await screen.findByText('Step 1 of 6')).toBeInTheDocument()
    const receipt = screen.getByRole('region', { name: /Changed on the invoice/ })
    await user.click(within(receipt).getByRole('button', { name: 'Show me' }))
    expect(await screen.findByText('Step 3 of 6')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Client or company name')).toHaveAttribute('data-shown'))
    // pressing into the marked field keeps the mark; pressing elsewhere on the screen clears it
    await user.click(screen.getByLabelText('Client or company name'))
    expect(screen.getByLabelText('Client or company name')).toHaveAttribute('data-shown')
    await user.click(screen.getByLabelText('Contact person'))
    expect(screen.getByLabelText('Client or company name')).not.toHaveAttribute('data-shown')
  })

  it('switches to the whole workspace, on the same invoice, when the founder changes the mode', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Make an invoice/)
    await user.type(await screen.findByLabelText('Business name'), 'Kindred Gifting')
    await user.click(screen.getByRole('button', { name: /Choose how Droplet works/ }))
    await user.click(screen.getByRole('menuitemradio', { name: /Workspace/ }))
    // every part of the invoice is in the panel at once, on the same invoice
    expect(await screen.findByRole('region', { name: 'Invoice details' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Client' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Kindred Gifting')
  })

  it('finishes only once the founder confirms, then closes and shows the invoice in the chat', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Make an invoice/)
    await user.type(await screen.findByLabelText('Business name'), 'Kindred Gifting')
    await continueOn(user)
    await screen.findByText('Step 2 of 6')
    await continueOn(user)
    await user.type(await screen.findByLabelText('Client or company name'), 'Karoo Candles')
    await continueOn(user)
    await screen.findByText('Step 4 of 6')
    await user.type(screen.getByLabelText('Description'), 'Soy candles')
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '30')
    await user.type(screen.getByLabelText('Price each, in rand'), '85')
    await continueOn(user)
    await screen.findByText('Step 5 of 6')
    await continueOn(user)
    expect(await screen.findByText('Step 6 of 6')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Finish' }))
    const note = await screen.findByRole('dialog', { name: 'Save to DuckStack' })
    // cancelling keeps nothing and leaves the guide where it was
    await user.click(within(note).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Step 6 of 6')).toBeInTheDocument()
    expect((await loadMemory('duckstack')).invoices).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Save to DuckStack' })).getByRole('button', { name: 'Save and finish' }))
    expect(await screen.findByText(/Invoice INV-0001 for Karoo Candles is finished and saved\./)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Step 6 of 6')).not.toBeInTheDocument())
    const card = screen.getByRole('region', { name: 'Invoice INV-0001' })
    expect(card).toHaveTextContent('Karoo Candles')
    expect(card).toHaveTextContent(/2[\s\u00a0]550,00/)
    expect(within(card).getByRole('button', { name: 'Export PDF' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Open' })).toBeInTheDocument()
    const memory = await loadMemory('duckstack')
    expect(memory.invoices).toHaveLength(1)
    expect(memory.business?.details.name).toBe('Kindred Gifting')
    // the card is kept with the chat
    await waitFor(async () => expect((await loadChatsFor())[0]?.messages.find((item) => item.result)?.result).toMatchObject({ number: 'INV-0001', client: 'Karoo Candles', totalCents: 255_000 }))

    // Open brings it back, on its last step
    await user.click(within(card).getByRole('button', { name: 'Open' }))
    expect(await screen.findByText('Step 6 of 6')).toBeInTheDocument()
  })
})


describe('Quick only', () => {
  // The Advanced switch is out of the menu: searching needs a Gemini key with billing, which a free key does not have.
  it('has no Advanced switch, asks the server nothing about an allowance, and sends every message as Quick', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'Hello.')]
    renderHome()
    await user.click(screen.getByRole('button', { name: /Choose how Droplet works/ }))
    expect(screen.getByRole('menu', { name: 'How Droplet works' })).not.toHaveTextContent(/Advanced|Searches the web/)
    await user.keyboard('{Escape}')
    await say(user, 'Hi there')
    await screen.findByText('Hello.')
    expect(asked[0]).not.toHaveProperty('mode')
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => (init as { method?: string }).method === 'GET')).toBe(false)
  })
})

describe('opening, switching and closing workspaces', () => {
  const toolbar = taskBar
  const inBrand = () => screen.queryByRole('button', { name: /^Remove colour 1,/ })
  const inInvoice = () => screen.queryByLabelText(/^Invoice INV-0001/)

  it.each([
    ['Open the invoice workspace', 'invoice'],
    ['Open the brand workspace', 'brand'],
    ['Open the business idea board', 'board'],
  ])('opens a workspace in code when the message is exactly "%s", and asks the composer once', async (phrase, view) => {
    const user = userEvent.setup()
    answers = [reply('chat', 'Here it is.')]
    renderHome()
    await say(user, phrase)
    await screen.findByText('Here it is.')
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ view, open: [view] })
    // no divider: the founder was not in another workspace
    expect(screen.queryByText(/Switched workspace/)).not.toBeInTheDocument()
  })

  it('does not open a workspace in code for words that merely contain a phrase: those are the composer\'s to read', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'Which invoice?')]
    renderHome()
    await say(user, 'Open the invoice workspace please')
    await screen.findByText('Which invoice?')
    expect(asked[0].view).toBeUndefined()
    expect(asked[0]).not.toHaveProperty('open')
    expect(toolbar()).not.toBeInTheDocument()
  })

  it('tells the composer which workspaces are open, and which is on screen', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'Fine.')]
    renderHome()
    await pickTask(user, /Build the brand/)
    await pickTask(user, /Make an invoice/)
    await say(user, 'How does this look?')
    await screen.findByText('Fine.')
    expect(asked[0]).toMatchObject({ view: 'invoice', open: ['brand', 'invoice'] })
  })

  it('shows another workspace that is open when the reply says switch_to, and keeps both as they were', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'Back to the palette.', [{ type: 'switch_to', workspace: 'brand' }])]
    renderHome()
    await pickTask(user, /Build the brand/)
    await pickTask(user, /Make an invoice/)
    await screen.findByLabelText(/^Invoice INV-0001/)
    await say(user, 'lets go back to the palette')
    await screen.findByText('Back to the palette.')
    await waitFor(() => expect(inBrand()).toBeInTheDocument())
    expect(inInvoice()).not.toBeInTheDocument()
    // asked once, and it did not need the founder's words quoted
    expect(asked).toHaveLength(1)
    // the invoice is still open, and can be switched back to
    answers = [reply('chat', 'And the invoice.', [{ type: 'switch_to', workspace: 'invoice' }])]
    await say(user, 'now the invoice')
    await screen.findByText('And the invoice.')
    await waitFor(() => expect(inInvoice()).toBeInTheDocument())
    expect(asked[1]).toMatchObject({ view: 'brand', open: ['brand', 'invoice'] })
  })

  it('refuses a switch to a workspace that is not open: the screen stays as it is, and the founder is told the answer could not be used', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'To the invoice.', [{ type: 'switch_to', workspace: 'invoice' }])]
    renderHome()
    await pickTask(user, /Build the brand/)
    await say(user, 'go to the invoice')
    await screen.findByText(/I got an answer I could not use/)
    expect(inBrand()).toBeInTheDocument()
    expect(inInvoice()).not.toBeInTheDocument()
  })

  it('closes the workspaces when the reply says close_workspace, with nothing unsaved to ask about', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'Taking you back to the full chat.', [{ type: 'close_workspace' }])]
    renderHome()
    await pickTask(user, /Build the brand/)
    await say(user, 'close the workspace')
    await screen.findByText('Taking you back to the full chat.')
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(asked).toHaveLength(1)
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument()
  })

  it('asks in the thread first when there is unsaved work, after the reply, and closes nothing until the founder says', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'Taking you back to the full chat.', [{ type: 'close_workspace' }])]
    renderHome()
    await pickTask(user, /Build the brand/)
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await say(user, 'close the workspace')
    expect(await screen.findByText(/You have unsaved changes in the brand palette/)).toBeInTheDocument()
    expect(screen.getByText('Taking you back to the full chat.')).toBeInTheDocument()
    expect(toolbar()).toBeInTheDocument()
    expect(await loadPalette('duckstack')).toBeNull()
    // the same buttons as Back to the full chat, usable once the request is done
    await user.click(screen.getByRole('button', { name: 'Keep working' }))
    expect(toolbar()).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to the full chat' }))
    await user.click(await screen.findByRole('button', { name: 'Leave without saving' }))
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(screen.getByText('I closed the workspace without saving.')).toBeInTheDocument()
  })

  it('refuses close_workspace when nothing is open', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'Closing.', [{ type: 'close_workspace' }])]
    renderHome()
    await say(user, 'close it')
    await screen.findByText(/I got an answer I could not use/)
    expect(asked).toHaveLength(1)
  })
})

describe('the change receipt', () => {
  const addNote = async (user: ReturnType<typeof userEvent.setup>) => {
    const note = await screen.findByRole('button', { name: 'Note' })
    if (note.getAttribute('aria-pressed') !== 'true') await user.click(note)
    await user.click(await screen.findByRole('button', { name: 'Add a note to the middle of the view' }))
  }
  const withNote = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    await addNote(user)
    await user.keyboard(`${text}{Escape}`)
  }
  const pink = () => [...document.querySelectorAll<HTMLElement>('.note[data-colour="pink"]')]
  const card = () => screen.getByRole('region', { name: /^(Changed|Nothing changed) on the/ })
  const twoIdeas = () =>
    reply('ideation', 'I added two ideas beside your note.', [
      { type: 'add_note', text: 'Corporate hampers', near: 'n1', connect: true },
      { type: 'add_note', text: 'Thank-you boxes', near: 'n1', connect: true },
    ])

  it('shows what a reply did to the board under it, one line for each kind of change, built from what was applied', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Gift boxes for offices')
    answers = [twoIdeas()]
    await say(user, 'Give me some related ideas')
    await screen.findByText(/I added two ideas beside your note/)
    const receipt = card()
    expect(within(receipt).getByRole('heading', { name: 'Changed on the board' })).toBeInTheDocument()
    expect(within(receipt).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['+Added: 2 notes beside “Gift boxes for offices”', '+Added: 2 arrows'])
    // the old text about what could not be done is not in the words any more
    expect(screen.queryByText(/I could not do everything/)).not.toBeInTheDocument()
  })

  it('shows what a reply did to the palette, and to the invoice, without a detail of the client', async () => {
    const user = userEvent.setup()
    answers = [reply('brand', 'Colour 1 is the main one now.', [{ type: 'set_role', index: 1, role: 'primary' }])]
    renderHome()
    await pickTask(user, /Build the brand/)
    await say(user, 'make colour 1 the primary')
    await screen.findByText('Colour 1 is the main one now.')
    expect(within(card()).getByRole('heading', { name: 'Changed on the palette' })).toBeInTheDocument()
    expect(within(card()).getByText('Colour 1 is now the primary colour')).toBeInTheDocument()

    answers = [reply('invoice', 'Done.', [{ type: 'set_client', name: 'Karoo Candles', address: '12 Long Street' }, { type: 'add_line', description: 'Soy candle', quantity: 30, unitPrice: 'R85' }])]
    await pickTask(user, /Make an invoice/)
    await screen.findByLabelText(/^Invoice INV-0001/)
    await say(user, 'Bill Karoo Candles for 30 soy candles at R85, 12 Long Street')
    await screen.findByText('Done.')
    const receipts = screen.getAllByRole('region', { name: 'Changed on the invoice' })
    const text = receipts[0].textContent ?? ''
    expect(text).toContain('Client: set the name (“Karoo Candles”), the address')
    expect(text).toMatch(/Line 1: Soy candle × 30, R/)
    expect(text).not.toContain('Long Street')
  })

  it('shows nothing under a reply that changed nothing and left nothing out', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'Hello there.')]
    renderHome()
    await say(user, 'hi')
    await screen.findByText('Hello there.')
    expect(screen.queryByRole('region', { name: /on the/ })).not.toBeInTheDocument()
  })

  it('takes back the reply with Undo this, as one step, and says so', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Gift boxes for offices')
    answers = [twoIdeas()]
    await say(user, 'Give me some related ideas')
    await screen.findByText(/I added two ideas beside your note/)
    expect(pink()).toHaveLength(2)
    await user.click(within(card()).getByRole('button', { name: 'Undo this' }))
    expect(pink()).toHaveLength(0)
    expect(document.querySelectorAll('[data-kind="connector"]')).toHaveLength(0)
    // the founder's own note is still there
    expect(screen.getByText('Gift boxes for offices')).toBeInTheDocument()
    expect(within(card()).getByRole('status')).toHaveTextContent('Undone. It is as it was before this reply.')
    expect(within(card()).queryByRole('button', { name: 'Undo this' })).not.toBeInTheDocument()
  })

  it('says so, and points to the workspace\'s own Undo, when the board has moved on since', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Gift boxes for offices')
    answers = [twoIdeas()]
    await say(user, 'Give me some related ideas')
    await screen.findByText(/I added two ideas beside your note/)
    await withNote(user, 'Another thought of my own')
    await user.click(within(card()).getByRole('button', { name: 'Undo this' }))
    expect(within(card()).getByRole('status')).toHaveTextContent('Things have changed since, so I cannot take back just this. Use Undo in the header to step back.')
    // nothing was taken back
    expect(pink()).toHaveLength(2)
    expect(screen.getByText('Another thought of my own')).toBeInTheDocument()
  })

  it('says the workspace is closed when it has been closed since', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    answers = [reply('ideation', 'One idea.', [{ type: 'add_note', text: 'Pet Pals' }])]
    await say(user, 'an idea')
    await screen.findByText('One idea.')
    await user.click(screen.getByRole('button', { name: 'Back to the full chat' }))
    await user.click(await screen.findByRole('button', { name: 'Leave without saving' }))
    await user.click(within(card()).getByRole('button', { name: 'Undo this' }))
    expect(within(card()).getByRole('status')).toHaveTextContent('That workspace is closed now, so there is nothing to undo.')
  })

  it('brings what changed into view and outlines it with Show me', async () => {
    const user = userEvent.setup()
    const { container } = renderHome()
    await pickTask(user, /Shape the business idea/)
    answers = [reply('ideation', 'One idea.', [{ type: 'add_note', text: 'Pet Pals' }])]
    await say(user, 'an idea')
    await screen.findByText('One idea.')
    const mine = pink()[0]
    mine.scrollIntoView = vi.fn()
    await user.click(within(card()).getByRole('button', { name: 'Show me' }))
    // a blue border that stays (styled by data-shown), until a press elsewhere on the screen or a new message
    await waitFor(() => expect(mine).toHaveAttribute('data-shown'))
    expect(mine.scrollIntoView).toHaveBeenCalled()
    await user.pointer({ keys: '[MouseLeft]', target: container.querySelector('.home__header')! })
    expect(mine).not.toHaveAttribute('data-shown')
    await user.click(within(card()).getByRole('button', { name: 'Show me' }))
    await waitFor(() => expect(mine).toHaveAttribute('data-shown'))
    answers = [reply('chat', 'Sure.')]
    await say(user, 'thanks')
    expect(mine).not.toHaveAttribute('data-shown')
  })

  it('keeps the receipt with the saved chat, the lines and how Undo this ended, and not the buttons', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    answers = [reply('ideation', 'One idea.', [{ type: 'add_note', text: 'Pet Pals' }])]
    await say(user, 'an idea')
    await screen.findByText('One idea.')
    await user.click(within(card()).getByRole('button', { name: 'Undo this' }))
    await waitFor(async () => {
      const kept = (await loadChatsFor())[0].messages.find((item) => item.receipt)
      expect(kept?.receipt).toEqual({ heading: 'Changed on the board', lines: [{ mark: '+', text: '1 note on the board' }], left: [], status: 'Undone. It is as it was before this reply.' })
      expect(kept && 'receiptLive' in kept).toBe(false)
    })
  })

  it('does not send a receipt to the composer with the conversation', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    answers = [reply('ideation', 'One idea.', [{ type: 'add_note', text: 'Pet Pals' }]), reply('chat', 'Fine.')]
    await say(user, 'an idea')
    await screen.findByText('One idea.')
    await say(user, 'thanks')
    await screen.findByText('Fine.')
    expect(JSON.stringify((asked[1] as unknown as { history: unknown }).history)).not.toMatch(/Changed on the|1 note on the board/)
  })

  it('puts the receipt of an answer that searched the web in the app\'s own message after it, so nothing is mixed into the answer', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    answers = [{ outcome: 'valid', answeredBy: 'advanced', grounding: { queries: ['cipc fee'], sources: [{ title: 'cipc.co.za', url: 'https://www.cipc.co.za/fees' }] }, turn: { task: 'ideation', message: 'I added a note with what I found.', actions: [{ type: 'add_note', text: 'CIPC fee is about R175' }], memoryUsed: [] } }]
    await say(user, 'Add what CIPC charges to the board')
    const grounded = (await screen.findByText('I added a note with what I found.')).closest('li')!
    expect(within(grounded).queryByRole('region', { name: /on the board/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Changed on the board' })).toBeInTheDocument()
  })
})

describe('facts Droplet offers to remember', () => {
  const said = 'we sell to corporate clients in Pretoria'
  const offering = (propose: unknown[], message = 'That helps.') => ({ outcome: 'valid', answeredBy: 'base', turn: { task: 'chat', message, actions: [], propose, memoryUsed: [] } })
  const who = { key: 'profile.who_for', value: 'Corporate clients in Pretoria', quote: said }
  const chips = () => screen.queryByRole('list', { name: 'Facts Droplet can remember' })
  const remembered = async () => currentFacts(await loadMemory('duckstack'))

  it('shows a fact under the reply, and remembers nothing until Remember is pressed', async () => {
    const user = userEvent.setup()
    answers = [offering([who])]
    renderHome()
    await say(user, said)
    await screen.findByText('That helps.')
    expect(within(chips()!).getByText('Remember: Corporate clients in Pretoria')).toBeInTheDocument()
    expect(await remembered()).toEqual({})
    await user.click(within(chips()!).getByRole('button', { name: /^Remember: Who it is for/ }))
    await waitFor(async () => expect(await remembered()).toEqual({ 'profile.who_for': 'Corporate clients in Pretoria' }))
    expect(chips()).not.toBeInTheDocument()
    // a quiet note with Undo
    expect(await screen.findByRole('status')).toHaveTextContent('Remembered: who it is for.')
  })

  it('takes it back with Undo, and forgets a fact that was new', async () => {
    const user = userEvent.setup()
    answers = [offering([who])]
    renderHome()
    await say(user, said)
    await user.click(await screen.findByRole('button', { name: /^Remember: Who it is for/ }))
    await waitFor(async () => expect(Object.keys(await remembered())).toHaveLength(1))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await remembered()).toEqual({}))
  })

  it('does not remember it with Not now, and does not offer it again in the same chat', async () => {
    const user = userEvent.setup()
    answers = [offering([who]), offering([who], 'And again.')]
    renderHome()
    await say(user, said)
    await user.click(await screen.findByRole('button', { name: /^Not now: Who it is for/ }))
    expect(chips()).not.toBeInTheDocument()
    expect(await remembered()).toEqual({})
    await say(user, `${said} still`)
    await screen.findByText('And again.')
    expect(chips()).not.toBeInTheDocument()
  })

  it('offers it again in another chat', async () => {
    const user = userEvent.setup()
    answers = [offering([who]), offering([who], 'Once more.')]
    renderHome()
    await say(user, said)
    await user.click(await screen.findByRole('button', { name: /^Not now: Who it is for/ }))
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    await say(user, said)
    await screen.findByText('Once more.')
    expect(chips()).toBeInTheDocument()
  })

  it('shows what is there and what it would become when it would change a fact, and keeps the old words if the founder updates', async () => {
    const user = userEvent.setup()
    await saveMemory('duckstack', withFact(emptyMemory(), 'profile.who_for', 'Any small business', '2026-10-06T10:00:00.000Z'))
    answers = [offering([who])]
    renderHome()
    await say(user, said)
    await screen.findByText('That helps.')
    expect(within(chips()!).getByText('Was: Any small business.')).toBeInTheDocument()
    expect(within(chips()!).getByText('Now: Corporate clients in Pretoria.')).toBeInTheDocument()
    await user.click(within(chips()!).getByRole('button', { name: /^Update: Who it is for/ }))
    await waitFor(async () => expect((await remembered())['profile.who_for']).toBe('Corporate clients in Pretoria'))
    expect((await loadMemory('duckstack')).facts?.['profile.who_for']?.earlier[0].value).toBe('Any small business')
    // Undo puts the old words back
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await remembered())['profile.who_for']).toBe('Any small business'))
  })

  it('keeps the old words with Keep the old', async () => {
    const user = userEvent.setup()
    await saveMemory('duckstack', withFact(emptyMemory(), 'profile.who_for', 'Any small business', '2026-10-06T10:00:00.000Z'))
    answers = [offering([who])]
    renderHome()
    await say(user, said)
    await user.click(await screen.findByRole('button', { name: /^Keep the old: Who it is for/ }))
    expect((await remembered())['profile.who_for']).toBe('Any small business')
    expect(chips()).not.toBeInTheDocument()
  })

  it('does not offer a fact that is already remembered with the same words: the app refuses the reply', async () => {
    const user = userEvent.setup()
    await saveMemory('duckstack', withFact(emptyMemory(), 'profile.who_for', 'Corporate clients in Pretoria', '2026-10-06T10:00:00.000Z'))
    answers = [offering([who])]
    renderHome()
    await say(user, said)
    await screen.findByText(/I got an answer I could not use/)
    expect(chips()).not.toBeInTheDocument()
  })

  it('remembers the name and the offer where the board does, so an invoice has the name', async () => {
    const user = userEvent.setup()
    answers = [offering([{ key: 'business.name', value: 'DuckStack', quote: 'DuckStack' }])]
    renderHome()
    await say(user, 'It is called DuckStack')
    await user.click(await screen.findByRole('button', { name: /^Remember: The name/ }))
    await waitFor(async () => expect((await loadMemory('duckstack')).idea?.name).toBe('DuckStack'))
    expect((await loadMemory('duckstack')).business?.details.name).toBe('DuckStack')
  })

  it('sends what is remembered with the first message of a new chat', async () => {
    const user = userEvent.setup()
    await saveMemory('duckstack', withFact(emptyMemory(), 'profile.what', 'Builds full-stack software', '2026-10-06T10:00:00.000Z'))
    answers = [reply('chat', 'Hello.')]
    renderHome()
    await say(user, 'hi')
    await screen.findByText('Hello.')
    expect((asked[0] as unknown as { project: { facts: Record<string, string> } }).project.facts).toEqual({ 'profile.what': 'Builds full-stack software' })
  })

  it('opens the project brief from the row under the project switcher', async () => {
    const user = userEvent.setup()
    await saveMemory('duckstack', withFact(emptyMemory(), 'profile.what', 'Builds full-stack software', '2026-10-06T10:00:00.000Z'))
    renderHome()
    await user.click(within(screen.getByRole('group', { name: 'This project' })).getByRole('button', { name: 'Project brief' }))
    const dialog = await screen.findByRole('dialog', { name: /^Project brief/ })
    expect(await within(dialog).findByText('Builds full-stack software')).toBeInTheDocument()
  })

  it('ticks the brand values and the logo in a plan once the facts are remembered', async () => {
    const user = userEvent.setup()
    await saveMemory('duckstack', withFact(withFact(emptyMemory(), 'brand.values', 'Playful, warm', '2026-10-06T10:00:00.000Z'), 'logo.status', 'Made in Canva', '2026-10-06T10:00:00.000Z'))
    answers = [reply('chat', 'Hi.')]
    renderHome()
    await say(user, 'hello')
    await screen.findByText('Hi.')
    expect((asked[0] as unknown as { project: { facts: Record<string, string> } }).project.facts).toMatchObject({ 'brand.values': 'Playful, warm', 'logo.status': 'Made in Canva' })
  })
})


describe('making and renaming projects from the switcher', () => {
  // HomeRoute's part, in miniature: the projects are held by the parent, and Home is given the new list.
  function Harness({ fail = false }: { fail?: boolean }) {
    const [projects, setProjects] = useState([{ id: 'duckstack', name: 'DuckStack' }])
    return (
      <MemoryRouter>
        <Home
          projects={projects}
          onCreateProject={async (name) => {
            if (fail) return null
            const made = { id: 'pet', name }
            setProjects((current) => [...current, made])
            return made
          }}
          onRenameProject={async (id, name) => {
            setProjects((current) => current.map((project) => (project.id === id ? { ...project, name } : project)))
            return { id, name }
          }}
        />
      </MemoryRouter>
    )
  }

  const trigger = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })

  it('makes a project and moves to it, with a new, empty conversation and its own saved work', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(trigger('DuckStack'))
    await user.click(screen.getByRole('menuitem', { name: 'New project' }))
    await user.type(screen.getByRole('textbox', { name: 'Business or project name' }), 'Pet sitting')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(trigger('Pet sitting')).toBeInTheDocument())
    // the project brief now belongs to the new project
    await user.click(within(screen.getByRole('group', { name: 'This project' })).getByRole('button', { name: 'Project brief' }))
    expect(await screen.findByRole('dialog', { name: /^Project brief/ })).toHaveTextContent('Pet sitting')
  })

  it('says so, and stays where it was, when the project could not be made', async () => {
    const user = userEvent.setup()
    render(<Harness fail />)
    await user.click(trigger('DuckStack'))
    await user.click(screen.getByRole('menuitem', { name: 'New project' }))
    await user.type(screen.getByRole('textbox', { name: 'Business or project name' }), 'Pet sitting')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not make that project.')
    expect(screen.getByRole('textbox', { name: 'Business or project name' })).toHaveValue('Pet sitting')
    expect(trigger('DuckStack')).toBeInTheDocument()
  })

  it('renames the current project and shows the new name in the switcher and the brief', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(trigger('DuckStack'))
    await user.click(screen.getByRole('menuitem', { name: 'Rename project' }))
    const field = screen.getByRole('textbox', { name: 'Business or project name' })
    await user.clear(field)
    await user.type(field, 'DuckStack Studio')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(trigger('DuckStack Studio')).toBeInTheDocument())
    await user.click(within(screen.getByRole('group', { name: 'This project' })).getByRole('button', { name: 'Project brief' }))
    expect(await screen.findByRole('dialog', { name: /^Project brief/ })).toHaveTextContent('DuckStack Studio')
  })

  it('has the items but cannot use them when it is given no way to make or rename a project', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(trigger('DuckStack'))
    expect(screen.getByRole('menuitem', { name: 'New project' })).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('looking back at past chats', () => {
  const idea = 'I want to call my gift business Kindred Gifting'
  const memory = { task: 'ideation', subject: 'Naming the business', decided: ['settled on the name Kindred Gifting'], open: ['the colours are not chosen yet'] }
  const newChat = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'New chat' }))
  const summarised = async () => (await loadChatsFor())[0]

  it('writes down a chat it has been left, in the background, and keeps it with the chat', async () => {
    const user = userEvent.setup()
    summaryAnswer = memory
    answers = [reply('chat', 'Lovely name.')]
    renderHome()
    await say(user, idea)
    await screen.findByText('Lovely name.')
    await newChat(user)
    await waitFor(async () => expect((await summarised()).summary).toEqual(memory))
    expect(summaries).toHaveLength(1)
    expect(summaries[0].messages.map((message) => message.role)).toEqual(['founder', 'droplet'])
    expect(summaries[0].messages[0].text).toBe(idea)
    expect((await summarised()).summarisedAt).toBeDefined()
    // it did not hold up the next chat, and is not a message in the thread
    expect(screen.queryByText('Naming the business')).not.toBeInTheDocument()
  })

  it('does not write down a chat that has not changed since it was last written down', async () => {
    const user = userEvent.setup()
    summaryAnswer = memory
    answers = [reply('chat', 'Lovely name.')]
    renderHome()
    await say(user, idea)
    await screen.findByText('Lovely name.')
    await newChat(user)
    await waitFor(async () => expect((await summarised()).summary).toBeDefined())
    // open it again and leave it again without a word
    await user.click(within(await screen.findByRole('navigation', { name: 'Chats' })).getByRole('button', { name: /^I want to call my gift business/ }))
    await newChat(user)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(summaries).toHaveLength(1)
  })

  it('does not write down a bare hello', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'Hello.')]
    renderHome()
    await say(user, 'hi')
    await screen.findByText('Hello.')
    await newChat(user)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(summaries).toHaveLength(0)
  })

  it('keeps nothing from a memory that has a name that is not in the chat, and does not ask again until the chat changes', async () => {
    const user = userEvent.setup()
    summaryAnswer = { ...memory, decided: ['settled on the name DuckStack'] }
    answers = [reply('chat', 'Lovely name.')]
    renderHome()
    await say(user, idea)
    await screen.findByText('Lovely name.')
    await newChat(user)
    await waitFor(async () => expect((await summarised()).summarisedAt).toBeDefined())
    expect((await summarised()).summary).toBeUndefined()
  })

  it('writes down and sends nothing when the founder has switched looking back off', async () => {
    const user = userEvent.setup()
    await saveMemory('duckstack', withSetting(emptyMemory(), 'recall', false))
    summaryAnswer = memory
    answers = [reply('chat', 'Lovely name.'), reply('chat', 'Again.')]
    renderHome()
    await say(user, idea)
    await screen.findByText('Lovely name.')
    await newChat(user)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(summaries).toHaveLength(0)
    expect((await summarised()).summary).toBeUndefined()
    await say(user, 'What next?')
    await screen.findByText('Again.')
    expect(asked[1]).not.toHaveProperty('earlierChats')
  })

  it('sends the most relevant memories with a message in another chat, dated, and not the chat it is in', async () => {
    const user = userEvent.setup()
    summaryAnswer = memory
    answers = [reply('chat', 'Lovely name.'), reply('chat', 'Right.')]
    renderHome()
    await say(user, idea)
    await screen.findByText('Lovely name.')
    await newChat(user)
    await waitFor(async () => expect((await summarised()).summary).toBeDefined())
    await say(user, 'What was the name we settled on?')
    await screen.findByText('Right.')
    const sent = (asked[1] as unknown as { earlierChats: { when: string; text: string }[] }).earlierChats
    expect(sent).toHaveLength(1)
    expect(sent[0].when).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(sent[0].text).toBe('About: Naming the business; Decided: settled on the name Kindred Gifting; Still open: the colours are not chosen yet')
  })

  it('does not write down a chat that was deleted', async () => {
    const user = userEvent.setup()
    summaryAnswer = memory
    answers = [reply('chat', 'Lovely name.')]
    renderHome()
    await say(user, idea)
    await screen.findByText('Lovely name.')
    await user.click(await screen.findByRole('button', { name: /^More for / }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(summaries).toHaveLength(0)
  })
})

describe("Droplet's notes on the project", () => {
  const addNote = async (user: ReturnType<typeof userEvent.setup>) => {
    const note = await screen.findByRole('button', { name: 'Note' })
    if (note.getAttribute('aria-pressed') !== 'true') await user.click(note)
    await user.click(await screen.findByRole('button', { name: 'Add a note to the middle of the view' }))
  }
  const withNote = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    await addNote(user)
    await user.keyboard(`${text}{Escape}`)
  }
  const digest = { about: 'Ideas for names', decided: [], open: [], standouts: [{ ref: 'r1', reason: 'my favourite' }] }
  const saveBoardNow = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))

  it('keeps an index of the board when it is saved, word for word, and asks Quick for a digest in the background', async () => {
    const user = userEvent.setup()
    digestAnswer = digest
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Care plan for older dogs')
    expect((await loadNotes('duckstack')).board).toBeUndefined()
    await saveBoardNow(user)
    await waitFor(async () => expect((await loadNotes('duckstack')).board?.index.map((line) => line.text)).toEqual(['Care plan for older dogs']))
    await waitFor(() => expect(digests).toHaveLength(1))
    expect(digests[0]).toMatchObject({ workspace: 'board', items: [{ ref: 'r1', text: 'Care plan for older dogs' }] })
    await waitFor(async () => expect((await loadNotes('duckstack')).board?.digest?.text).toContain('“Care plan for older dogs” (my favourite)'))
  })

  it('does not hold up the save, and asks for nothing when it is saved again unchanged', async () => {
    const user = userEvent.setup()
    digestAnswer = digest
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Care plan for older dogs')
    await saveBoardNow(user)
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
    await waitFor(() => expect(digests).toHaveLength(1))
    await withNote(user, 'Pet Pals')
    await saveBoardNow(user)
    await new Promise((resolve) => setTimeout(resolve, 60))
    // the second save is under five minutes after the first digest: the index is brought up to date, and no new digest is asked for
    expect((await loadNotes('duckstack')).board?.index).toHaveLength(2)
    expect(digests).toHaveLength(1)
  })

  it('sends the digests of the workspaces that are not on screen with a message, and not the one that is', async () => {
    const user = userEvent.setup()
    digestAnswer = digest
    answers = [reply('chat', 'Noted.'), reply('chat', 'Noted again.')]
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Care plan for older dogs')
    await saveBoardNow(user)
    await waitFor(async () => expect((await loadNotes('duckstack')).board?.digest).toBeDefined())
    // the board is on screen: it is in front of Droplet in full, and not sent
    await say(user, 'What do you think?')
    await screen.findByText('Noted.')
    expect(asked[0]).not.toHaveProperty('notes')
    // the palette is on screen now, so the board's notes are sent
    await pickTask(user, /Build the brand/)
    await say(user, 'And now?')
    await screen.findByText('Noted again.')
    const sent = (asked[1] as unknown as { notes: { digests: { workspace: string; text: string }[] } }).notes
    expect(sent.digests.map((entry) => entry.workspace)).toEqual(['board'])
    expect(sent.digests[0].text).toContain('“Care plan for older dogs”')
  })

  it('adds the lines of the notes that match words the digests do not cover', async () => {
    const user = userEvent.setup()
    digestAnswer = { about: 'Ideas for names', decided: [], open: [], standouts: [] }
    answers = [reply('chat', 'Noted.')]
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Weekend walks in Brooklyn')
    await saveBoardNow(user)
    await waitFor(async () => expect((await loadNotes('duckstack')).board?.digest).toBeDefined())
    await pickTask(user, /Build the brand/)
    await say(user, 'What did I say about Brooklyn?')
    await screen.findByText('Noted.')
    expect((asked[0] as unknown as { notes: { found: { text: string; workspace: string }[] } }).notes.found).toEqual([expect.objectContaining({ workspace: 'board', text: 'Weekend walks in Brooklyn' })])
  })

  it('keeps nothing, asks for nothing and sends nothing when the founder has switched the notes off', async () => {
    const user = userEvent.setup()
    await saveMemory('duckstack', withSetting(emptyMemory(), 'notes', false))
    digestAnswer = digest
    renderHome()
    await pickTask(user, /Shape the business idea/)
    await withNote(user, 'Care plan for older dogs')
    await saveBoardNow(user)
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(await loadNotes('duckstack')).toEqual({})
    expect(digests).toHaveLength(0)
  })

  it('keeps a colour in mind with a star, and the star goes into the notes and the digest request', async () => {
    const user = userEvent.setup()
    digestAnswer = { about: 'A blue palette', decided: [], open: [], standouts: [] }
    renderHome()
    await pickTask(user, /Build the brand/)
    await user.click(screen.getByRole('button', { name: /^Keep colour 1, .*, in mind$/ }))
    expect(screen.getByRole('button', { name: /^Keep colour 1, .*, in mind$/ })).toHaveAttribute('aria-pressed', 'true')
    await saveBoardNow(user)
    await waitFor(async () => expect((await loadNotes('duckstack')).brand?.index.some((line) => line.starred)).toBe(true))
    await waitFor(() => expect(digests).toHaveLength(1))
    expect(digests[0]).toMatchObject({ workspace: 'brand' })
    expect(digests[0].items.filter((item) => item.starred)).toHaveLength(1)
    await waitFor(async () => expect((await loadNotes('duckstack')).brand?.digest?.text).toContain('Kept in mind:'))
  })

  it('says on the invoice\'s save note that Droplet will update its notes, and not when they are off', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Make an invoice/)
    await user.type(await clientName(user), 'Karoo Candles')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Droplet will update its notes on this project.')).toBeInTheDocument()
  })
})

describe('the menu on a chat', () => {
  it('pins a chat to the top of the list, and unpins it', async () => {
    const user = userEvent.setup()
    renderHome()
    answers = [reply('chat', 'First answer.')]
    await say(user, 'First question')
    await screen.findByText('First answer.')
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    answers = [reply('chat', 'Second answer.')]
    await say(user, 'Second question')
    await screen.findByText('Second answer.')
    const titles = () => within(screen.getByRole('navigation', { name: 'Chats' })).getAllByRole('listitem').map((item) => item.querySelector('.chatlist__title')?.textContent)
    await waitFor(() => expect(titles()).toEqual(['Second question', 'First question']))
    await user.click(screen.getByRole('button', { name: 'More for First question' }))
    await user.click(screen.getByRole('menuitem', { name: 'Pin' }))
    await waitFor(() => expect(titles()).toEqual(['First question', 'Second question']))
    await user.click(screen.getByRole('button', { name: 'More for First question' }))
    await user.click(screen.getByRole('menuitem', { name: 'Unpin' }))
    await waitFor(() => expect(titles()).toEqual(['Second question', 'First question']))
  })
})

describe('progress, stopping and asking again', () => {
  const encoder = new TextEncoder()
  const eventText = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`

  // A composer that streams: the test says when each stage and the reply arrive. It gives up when the request is aborted, as a real fetch does.
  const streamingComposer = () => {
    let stream: ReadableStreamDefaultController<Uint8Array> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: { method?: string; body: string; signal?: AbortSignal }) => {
        if (init.method === 'GET') return Promise.resolve(new Response('{}', { status: 500 }))
        return new Promise<Response>((resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
          resolve(
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  stream = controller
                },
              }),
              { status: 200, headers: { 'content-type': 'text/event-stream' } },
            ),
          )
        })
      }),
    )
    return {
      stage: (stage: unknown) => stream!.enqueue(encoder.encode(eventText('stage', stage))),
      result: (body: unknown) => {
        stream!.enqueue(encoder.encode(eventText('result', { status: 200, body })))
        stream!.close()
      },
    }
  }

  it('shows the stage Droplet is at while it works, and then the reply', async () => {
    const user = userEvent.setup()
    const composer = streamingComposer()
    renderHome()
    await say(user, 'What does CIPC cost?')
    expect(await screen.findByText(/Reading your message|Looking at what is saved/)).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    composer.stage({ stage: 'reading', search: true })
    expect(await screen.findByText('Reading your message, and looking things up if needed')).toBeInTheDocument()
    composer.stage({ stage: 'checking', searched: ['CIPC registration fee'] })
    expect(await screen.findByText(/Searched the web for “CIPC registration fee”\. Checking the reply/)).toBeInTheDocument()
    composer.result(reply('chat', 'It depends on the company type.'))
    expect(await screen.findByText('It depends on the company type.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
  })

  it('gives up on Stop: nothing is applied, the note says so, and the note is not sent to the composer afterwards', async () => {
    const user = userEvent.setup()
    streamingComposer()
    renderHome()
    await pickTask(user, /Build the brand/)
    await say(user, 'Make it warmer')
    await user.click(await screen.findByRole('button', { name: 'Stop' }))
    expect(await screen.findByText('Stopped. Nothing was changed.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    // The founder can carry on, and the app's note is not part of the conversation the composer is sent.
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { method?: string; body: string }) => {
      if (init.method === 'GET') return new Response('{}', { status: 500 })
      asked.push(JSON.parse(init.body) as never)
      return new Response(JSON.stringify(reply('chat', 'Fine.')), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    await say(user, 'Never mind')
    await screen.findByText('Fine.')
    expect(JSON.stringify(asked[0])).not.toMatch(/Stopped\. Nothing was changed/)
  })

  it('takes the last answer back and asks again on Try again, without the old answer in the conversation', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'First answer.'), reply('chat', 'Second answer.')]
    renderHome()
    await say(user, 'How should I price a gift box?')
    await screen.findByText('First answer.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Second answer.')
    expect(screen.queryByText('First answer.')).not.toBeInTheDocument()
    expect(within(screen.getByRole('log', { name: 'Conversation' })).getAllByText('How should I price a gift box?')).toHaveLength(1)
    expect(asked).toHaveLength(2)
    expect(asked[1].intent).toBe('How should I price a gift box?')
    expect(JSON.stringify(asked[1])).not.toContain('First answer.')
  })

  it('sends an edited message in place of the last exchange', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'First answer.'), reply('chat', 'Answer to the edit.')]
    renderHome()
    await say(user, 'How should I price a gift box?')
    await screen.findByText('First answer.')
    await user.click(screen.getByRole('button', { name: 'Edit your message' }))
    const field = screen.getByRole('textbox', { name: 'Edit your message' })
    await user.clear(field)
    await user.type(field, 'How should I price a corporate gift box?')
    await user.click(screen.getByRole('button', { name: 'Send again' }))
    await screen.findByText('Answer to the edit.')
    expect(asked[1].intent).toBe('How should I price a corporate gift box?')
    expect(screen.queryByText('How should I price a gift box?')).not.toBeInTheDocument()
    expect(screen.queryByText('First answer.')).not.toBeInTheDocument()
  })
})

describe('what Droplet used', () => {
  it('shows a line under a reply listing what went with the request, and keeps it with the saved chat', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'First answer.'), reply('chat', 'Second answer.')]
    renderHome()
    await say(user, 'How should I price a gift box?')
    await screen.findByText('First answer.')
    // nothing but the message and the project's counts went with the first
    expect(screen.getByRole('button', { name: 'Used: only your message' })).toBeInTheDocument()
    await say(user, 'And for a bigger order?')
    await screen.findByText('Second answer.')
    const line = screen.getAllByRole('button', { name: /^Used:/ }).at(-1)!
    expect(line).toHaveAccessibleName(/^Used: this chat/)
    expect(line).toHaveTextContent('What I used')
    await user.click(line)
    expect(screen.getByText(/Not sent: addresses, contact details and bank details/)).toBeInTheDocument()
    await waitFor(async () => expect((await loadChatsFor())[0]?.messages.filter((item) => item.used)).toHaveLength(2))
  })

  it('is built from the request, not from what the composer says it used', async () => {
    const user = userEvent.setup()
    answers = [{ outcome: 'valid', answeredBy: 'base', turn: { task: 'chat', message: 'Hello.', actions: [], memoryUsed: ['the secret palette', 'the client list'] } }]
    renderHome()
    await say(user, 'Hello')
    await screen.findByText('Hello.')
    const line = screen.getByRole('button', { name: /^Used:/ })
    expect(line).not.toHaveTextContent(/secret palette|client list/)
  })
})

describe('what Droplet says it is doing', () => {
  it('says what it is working from, taken from the request: the chat, the saved palette and the palette on screen', async () => {
    const user = userEvent.setup()
    let answer: (body: unknown) => void = () => undefined
    const slow = () =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: { method?: string; body: string }) => {
          if (init.method === 'GET') return new Response('{}', { status: 500 })
          const sent = JSON.parse(init.body) as { kind?: string }
          if (sent.kind) return new Response(JSON.stringify({ kind: sent.kind, answeredBy: 'base', summary: null, digest: null }), { status: 200, headers: { 'content-type': 'application/json' } })
          asked.push(sent as never)
          return new Promise<Response>((resolve) => {
            answer = (body) => resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))
          })
        }),
      )
    slow()
    renderHome()
    await pickTask(user, /Build the brand/)
    await say(user, 'Make it warmer')
    expect(await screen.findByText(/Reading your message alongside the palette on screen/)).toBeInTheDocument()
    answer(reply('chat', 'Done.'))
    await screen.findByText('Done.')
    // the line under the reply lists the same things, so what was said while it worked is what is listed afterwards
    expect(screen.getByRole('button', { name: /^Used: the palette on screen/ })).toBeInTheDocument()
  })
})

describe('attaching files in the chat', () => {
  const picker = () => screen.getByLabelText('Choose files to attach', { selector: 'input' })

  it('sends the file with the message and only that message, shows its name in the thread, keeps no contents, and lists it as used', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'A list of two names.'), reply('chat', 'Fine.')]
    renderHome()
    await user.upload(picker(), new File(['# Names\n- Kindred Gifting\n- Maker Box'], 'names.md', { type: 'text/markdown' }))
    await screen.findByText('names.md')
    await say(user, 'Which of these is best?')
    await screen.findByText('A list of two names.')
    const sent = asked[0] as unknown as { attachments?: { kind: string; name: string; text?: string }[] }
    expect(sent.attachments).toEqual([{ kind: 'text', name: 'names.md', text: '# Names\n- Kindred Gifting\n- Maker Box' }])
    // the thread shows the name
    expect(within(screen.getByRole('log', { name: 'Conversation' })).getByRole('list', { name: 'Attached files' })).toHaveTextContent('names.md')
    // the reply's line lists the file, as sent whole
    await user.click(screen.getAllByRole('button', { name: /^Used:/ }).at(-1)!)
    expect(screen.getByText(/names\.md: sent whole for Droplet to read/)).toBeInTheDocument()
    // the next message carries no file, and the conversation says only that one was attached, never its words
    await say(user, 'Thanks')
    await screen.findByText('Fine.')
    expect(asked[1]).not.toHaveProperty('attachments')
    expect(JSON.stringify(asked[1])).toMatch(/Attached text file “names\.md”/)
    expect(JSON.stringify(asked[1])).not.toContain('Maker Box')
    // the saved chat keeps the name and kind, not the contents
    const saved = JSON.stringify(await loadChatsFor())
    expect(saved).toContain('names.md')
    expect(saved).not.toContain('Maker Box')
  })

  it('says a file could not be read, and still sends a message without it', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'Hello.')]
    renderHome()
    await user.upload(picker(), new File(['x'], 'song.mp3', { type: 'audio/mpeg' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a kind Droplet can read/)
    await say(user, 'Hi')
    await screen.findByText('Hello.')
    expect(asked[0]).not.toHaveProperty('attachments')
  })
})

describe('the side panel conversation', () => {
  it('shows one exchange at a time with a rail to move between them, once a workspace is open, and the whole thread when it is not', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'First answer.'), reply('chat', 'Second answer.')]
    const { container } = renderHome()
    await say(user, 'First question')
    await screen.findByText('First answer.')
    // the full chat is not paged
    expect(container.querySelector('.thread__page')).toBeNull()
    await pickTask(user, /Build the brand/)
    await say(user, 'Second question')
    await screen.findByText('Second answer.')
    expect(container.querySelectorAll('.thread__page')).toHaveLength(2)
    const rail = screen.getByRole('navigation', { name: 'Exchanges in this conversation' })
    expect(within(rail).getAllByRole('button')).toHaveLength(2)
    expect(within(rail).getByRole('button', { name: 'Go to exchange 1: First question' })).toBeInTheDocument()
  })
})
