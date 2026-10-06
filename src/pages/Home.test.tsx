import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadBoard } from '../lib/boardStore.ts'
import { loadChats, saveChats } from '../lib/chatStore.ts'
import { emptyMemory, withIdea } from '../lib/projectMemory.ts'
import { saveMemory } from '../lib/memoryStore.ts'
import { loadPalette } from '../lib/projectStore.ts'
import { setDocumentStorage, type DocumentStorage } from '../lib/storage.ts'
import { slowMemoryStorage } from '../test/slowStorage.ts'
import Home from './Home.tsx'

// Home with the composer's server standing in: what is asked of it is recorded, and what it says back is what the test decides.
type Asked = { intent: string; mode?: string; view?: string; invoice?: { lines: { description: string }[] }; workspace?: unknown }
let asked: Asked[] = []
let answers: unknown[] = []
// What the server says on a GET: where the founder's Advanced allowance stands. Null is a server that cannot say.
let allowanceNow: { advancedLeft: number; advancedLimit: number; resetsAt: string | null } | null = null

const reply = (task: string, message: string, actions: unknown[] = []) => ({ outcome: 'valid', answeredBy: 'base', turn: { task, message, actions, memoryUsed: [] } })
// A reply that opens a workspace the founder asked for, quoting their own words as the composer must.
const opening = (task: string, message: string, quote: string) => ({ outcome: 'valid', answeredBy: 'base', turn: { task, message, actions: [], opens: { because: 'asked', quote }, memoryUsed: [] } })

beforeEach(() => {
  window.localStorage.clear()
  asked = []
  answers = []
  allowanceNow = { advancedLeft: 10, advancedLimit: 10, resetsAt: null }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { method?: string; body: string }) => {
      if (init.method === 'GET') {
        return allowanceNow ? new Response(JSON.stringify({ allowance: allowanceNow }), { status: 200 }) : new Response('{}', { status: 500 })
      }
      asked.push(JSON.parse(init.body))
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

// The client's name is in the client window, which opens from its step in the toolbar.
const clientName = async (user: ReturnType<typeof userEvent.setup>) => {
  const step = within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: /^Client\./ })
  if (step.getAttribute('aria-expanded') !== 'true') await user.click(step)
  return screen.getByLabelText('Client or company name')
}

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
    // one undo takes back everything it did (a window opened from the toolbar is a step of its own, so none is opened first)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await clientName(user)).toHaveValue('')
    expect(screen.getByLabelText('Price each, in rand')).toHaveValue('')
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
    await waitFor(() => expect(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('group', { name: 'Colour picker' })).toBeInTheDocument())
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
  const entries = () => within(screen.getByRole('log', { name: 'Conversation' })).queryAllByRole('listitem')
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

  it('keeps the tip while a workspace is open and nothing has been said', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Build the brand/)
    expect(screen.getByRole('button', { name: /Show me a menu of available workspaces/ })).toBeInTheDocument()
  })
})

describe('going back to the full chat', () => {
  const back = () => screen.getByRole('button', { name: 'Back to the full chat' })
  const toolbar = () => screen.queryByRole('toolbar', { name: 'Tools' })
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
    await user.click(screen.getByRole('button', { name: 'Delete First question' }))
    expect(screen.getByText('Delete this chat?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(within(screen.getByRole('navigation', { name: 'Chats' })).getAllByRole('listitem')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Delete First question' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(within(screen.getByRole('navigation', { name: 'Chats' })).getAllByRole('listitem')).toHaveLength(1)
    expect((await loadChatsFor()).map((chat) => chat.title)).toEqual(['Second question'])
  })

  it('starts a new conversation when the open one is deleted', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'Only question', 'Only answer.')
    await user.click(screen.getByRole('button', { name: 'Delete Only question' }))
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
    await user.click(within(dialog).getByRole('button', { name: 'Delete Chat 10' }))
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

  it('shows the question after the answer, and sends a tapped reply as the founder\'s own message with the question in the history', async () => {
    const user = userEvent.setup()
    answers = [
      asking('Three ways to price:\n\n- **Cost plus**\n- **Value based**', 'Do you know your costs?', ['Yes, I know them', 'Not sure yet']),
      { outcome: 'valid', answeredBy: 'base', turn: { task: 'chat', message: 'Then start with cost plus.', actions: [], memoryUsed: [] } },
    ]
    renderHome()
    await say(user, 'How should I price my boxes?')
    await waitFor(() => expect(screen.getByText('Do you know your costs?')).toBeInTheDocument())
    expect(screen.getByText('Cost plus').tagName).toBe('STRONG')

    await user.click(screen.getByRole('button', { name: 'Not sure yet' }))
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

describe('the wave behind the conversation', () => {
  const backdrop = (container: HTMLElement) => container.querySelector('.home__backdrop')

  it('is there before anything has been said, as decoration', () => {
    const { container } = renderHome()
    expect(backdrop(container)).not.toBeNull()
    expect(backdrop(container)).toHaveAttribute('aria-hidden', 'true')
    expect(backdrop(container)).not.toHaveAttribute('data-gone')
  })

  it('fades out when a message is sent, and comes back with a new chat', async () => {
    const user = userEvent.setup()
    const { container } = renderHome()
    answers = [reply('chat', 'Hello.')]
    await say(user, 'Hi')
    expect(backdrop(container)).toHaveAttribute('data-gone')
    await waitFor(() => expect(screen.getByText('Hello.')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    expect(backdrop(container)).not.toHaveAttribute('data-gone')
  })

  it('is not behind a workspace', async () => {
    const user = userEvent.setup()
    const { container } = renderHome()
    await pickTask(user, /Build the brand/)
    expect(backdrop(container)).toBeNull()
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

  it('is shown over a workspace while the composer works on it', async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = () => resolve(new Response(JSON.stringify(reply('brand', 'Done.')), { status: 200, headers: { 'content-type': 'application/json' } })) })))
    const { container } = renderHome()
    await pickTask(user, /Build the brand/)
    await say(user, 'Warmer please')
    expect(container.querySelector('.glow')).not.toBeNull()
    release()
    await waitFor(() => expect(screen.getByText('Done.')).toBeInTheDocument())
  })
})

describe('the board for shaping the business idea', () => {
  const toolbar = () => screen.queryByRole('toolbar', { name: 'Tools' })
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

  it('has the board tools in the toolbar, which cannot be taken away', async () => {
    const user = userEvent.setup()
    renderHome()
    await pickTask(user, /Shape the business idea/)
    const bar = within(toolbar()!)
    for (const name of ['Select', 'Sticky note', 'Shape', 'Text', 'Frame', 'Arrow', 'Templates']) expect(bar.getByRole('group', { name })).toBeInTheDocument()
    // the options of a tool are there while it is in hand
    expect(bar.queryByRole('radiogroup', { name: 'Colour of the next note' })).not.toBeInTheDocument()
    await user.click(bar.getByRole('button', { name: 'Note' }))
    expect(bar.getByRole('radiogroup', { name: 'Colour of the next note' })).toBeInTheDocument()
    await user.click(bar.getByRole('button', { name: 'Shape' }))
    expect(bar.getByRole('radiogroup', { name: 'Kind of the next shape' })).toBeInTheDocument()
    await user.click(bar.getByRole('button', { name: 'Arrow' }))
    expect(bar.getByRole('radiogroup', { name: 'Line of the next arrow' })).toBeInTheDocument()
    // none of them can be taken away
    await user.click(bar.getByRole('button', { name: 'Add or remove a tool' }))
    for (const item of within(screen.getByRole('menu', { name: 'Tools in the toolbar' })).getAllByRole('menuitemcheckbox')) expect(item).toBeDisabled()
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
  const toolbar = () => screen.queryByRole('toolbar', { name: 'Tools' })

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
    await user.click(screen.getByRole('button', { name: 'Choose a task' }))
    await user.click(await screen.findByRole('menuitem', { name: /Build the brand/ }))
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
    await user.click(await screen.findByRole('button', { name: /Save/ }))
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
    expect(screen.queryByRole('toolbar', { name: 'Tools' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Board' })).not.toBeInTheDocument()
  })

  it('refuses a reply that opens a palette without a quote from the founder, so no workspace opens and nothing odd reaches the thread', async () => {
    const user = userEvent.setup()
    const palette = { type: 'set_palette', colours: [{ hex: '#111111', name: 'A', rationale: 'x' }, { hex: '#EEEEEE', name: 'B', rationale: 'x' }, { hex: '#336699', name: 'C', rationale: 'x' }], reason: 'Colours.' }
    answers = [{ outcome: 'valid', answeredBy: 'base', turn: { task: 'brand', message: 'Here are colours.', actions: [palette], memoryUsed: [] } }]
    renderHome()
    await say(user, 'I want to create a dev studio called DuckStack')
    await waitFor(() => expect(screen.getByText(/I got an answer I could not use/)).toBeInTheDocument())
    expect(screen.queryByRole('toolbar', { name: 'Tools' })).not.toBeInTheDocument()
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
    answers = [planReply, opening('ideation', 'Opening the board.', 'Open the business idea board'), reply('ideation', 'Here it is. What does DuckStack do?')]
    renderHome()
    await say(user, 'Not much yet')
    await user.click(await screen.findByRole('button', { name: 'Open Settle the name' }))
    expect(await screen.findByRole('region', { name: 'Board' })).toBeInTheDocument()
    expect(asked[1].intent).toBe('Open the business idea board')
    expect(asked[2]).toMatchObject({ view: 'board', intent: 'Open the business idea board' })
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

describe('Quick and Advanced', () => {
  const chooseAdvanced = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Choose how I answer' }))
    await user.click(screen.getByRole('menuitemradio', { name: /Advanced/ }))
  }

  it('asks the server how many Advanced answers are left before anything is said, and shows the count in the menu', async () => {
    const user = userEvent.setup()
    allowanceNow = { advancedLeft: 7, advancedLimit: 10, resetsAt: null }
    renderHome()
    await user.click(screen.getByRole('button', { name: 'Choose how I answer' }))
    expect(await screen.findByText('Searches the web · 7 of 10 left today')).toBeInTheDocument()
  })

  it('sends Quick as no mode, sends Advanced for the message it was chosen for, and then goes back to Quick', async () => {
    const user = userEvent.setup()
    answers = [reply('chat', 'First.'), reply('chat', 'Second.'), reply('chat', 'Third.')]
    renderHome()
    await say(user, 'a quick one')
    await screen.findByText('First.')
    await chooseAdvanced(user)
    await say(user, 'What does CIPC charge?')
    await screen.findByText('Second.')
    await say(user, 'and another quick one')
    await screen.findByText('Third.')
    expect(asked.map((request) => request.mode)).toEqual([undefined, 'advanced', undefined])
    expect(screen.queryByRole('button', { name: /Advanced is on/ })).not.toBeInTheDocument()
  })

  it('takes the count from the answer: one fewer after an Advanced answer, and a disabled row when none are left', async () => {
    const user = userEvent.setup()
    answers = [{ ...reply('chat', 'About R175.'), answeredBy: 'advanced', allowance: { advancedLeft: 0, advancedLimit: 10, resetsAt: new Date(2099, 0, 1, 14, 20).toISOString() } }]
    renderHome()
    await chooseAdvanced(user)
    await say(user, 'What does CIPC charge?')
    await screen.findByText('About R175.')
    await user.click(screen.getByRole('button', { name: 'Choose how I answer' }))
    const row = screen.getByRole('menuitemradio', { name: /Advanced/ })
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row).toHaveTextContent(/None left today/)
  })

  it('shows the note that Quick answered, when Advanced was busy, and counts nothing against the founder', async () => {
    const user = userEvent.setup()
    answers = [{ ...reply('chat', 'It is about R175.'), answeredBy: 'base', note: 'Advanced is busy today, so I answered with Quick.', allowance: { advancedLeft: 10, advancedLimit: 10, resetsAt: null } }]
    renderHome()
    await chooseAdvanced(user)
    await say(user, 'What does CIPC charge?')
    expect(await screen.findByText(/Advanced is busy today, so I answered with Quick\./)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose how I answer' }))
    expect(screen.getByRole('menuitemradio', { name: /Advanced/ })).toHaveTextContent('10 of 10 left today')
  })

  it('says plainly when none are left, takes the count from the refusal, and the message is not lost to a silent failure', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { method?: string }) => {
        if (init.method === 'GET') return new Response(JSON.stringify({ allowance: { advancedLeft: 1, advancedLimit: 10, resetsAt: null } }), { status: 200 })
        return new Response(
          JSON.stringify({ error: 'advanced_limit', message: 'You have used your 10 Advanced answers for today. Quick is still here.', allowance: { advancedLeft: 0, advancedLimit: 10, resetsAt: null } }),
          { status: 429 },
        )
      }),
    )
    renderHome()
    await chooseAdvanced(user)
    await say(user, 'What does CIPC charge?')
    expect(await screen.findByText(/You have used your 10 Advanced answers for today/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose how I answer' }))
    expect(screen.getByRole('menuitemradio', { name: /Advanced/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('still offers Advanced, without a count, when the server cannot say where the allowance stands', async () => {
    const user = userEvent.setup()
    allowanceNow = null
    renderHome()
    await user.click(screen.getByRole('button', { name: 'Choose how I answer' }))
    const row = screen.getByRole('menuitemradio', { name: /Advanced/ })
    expect(row).toHaveTextContent('Searches the web')
    expect(row).not.toHaveAttribute('aria-disabled')
  })

  it('asks again in Advanced when the answer takes the founder to another workspace: both asks answer the one message they chose it for', async () => {
    const user = userEvent.setup()
    answers = [opening('invoice', 'Opening the invoice.', 'make an invoice'), reply('invoice', 'Here it is.')]
    renderHome()
    await chooseAdvanced(user)
    await say(user, 'Please make an invoice')
    await screen.findByText('Here it is.')
    expect(asked.map((request) => request.mode)).toEqual(['advanced', 'advanced'])
    await say(user, 'thanks')
    expect(asked.at(-1)?.mode).toBeUndefined()
  })
})
