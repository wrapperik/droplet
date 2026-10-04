import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadChats } from '../lib/chatStore.ts'
import { loadPalette } from '../lib/projectStore.ts'
import Home from './Home.tsx'

// Home with the composer's server standing in: what is asked of it is recorded, and what it says back is what the test decides.
type Asked = { intent: string; view?: string; invoice?: { lines: { description: string }[] }; workspace?: unknown }
let asked: Asked[] = []
let answers: unknown[] = []

const reply = (task: string, message: string, actions: unknown[] = []) => ({ outcome: 'valid', turn: { task, message, actions, memoryUsed: [] } })

beforeEach(() => {
  window.localStorage.clear()
  asked = []
  answers = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
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
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
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
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
    // the answer is checked again in the browser, which refuses a price nobody wrote even if the server let it through
    await say(user, 'Add 30 soy candles, due in 7 days')
    await waitFor(() => expect(screen.getByText(/I got an answer I could not use/)).toBeInTheDocument())
    expect(screen.getByLabelText('Price each, in rand')).toHaveValue('')
  })

  it('opens the invoice and asks again when the request belongs there and no invoice is open, then fills it in', async () => {
    const user = userEvent.setup()
    answers = [
      reply('invoice', 'I am opening the invoice workspace.'),
      reply('invoice', 'I added the line.', [{ type: 'add_line', description: 'Gift box', quantity: 12, unitPrice: '450' }]),
    ]
    renderHome()
    await say(user, 'Invoice them for 12 gift boxes at 450')
    await waitFor(() => expect(screen.getByText('I added the line.')).toBeInTheDocument())
    expect(asked).toHaveLength(2)
    expect(asked[0].view).toBeUndefined()
    expect(asked[1]).toMatchObject({ view: 'invoice', intent: 'Invoice them for 12 gift boxes at 450' })
    expect(asked[1].invoice?.lines).toHaveLength(1)
    expect(screen.getByText('I am opening the invoice workspace.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Invoice INV-0001/)).toHaveTextContent('Gift box')
  })

  it('asks again only once, however the second answer comes back', async () => {
    const user = userEvent.setup()
    answers = [reply('invoice', 'Opening the invoice.'), reply('brand', 'That is about colours.')]
    renderHome()
    await say(user, 'invoice colours')
    await waitFor(() => expect(screen.getByText('That is about colours.')).toBeInTheDocument())
    expect(asked).toHaveLength(2)
  })

  it('opens the palette and asks again when the invoice is on screen and the request is about colours', async () => {
    const user = userEvent.setup()
    answers = [reply('brand', 'Opening the brand workspace.'), reply('brand', 'Colour 1 reads best.')]
    renderHome()
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
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
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
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
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
    await say(user, 'What is the total?')
    await waitFor(() => expect(asked).toHaveLength(1))
    const sent = JSON.stringify(asked[0])
    for (const secret of ['Jacaranda', 'hello@kindred', '082 000', '62000000000', 'FNB', '250655']) expect(sent, secret).not.toContain(secret)
    expect(asked[0].invoice).toMatchObject({ business: { name: 'Kindred Gifting', hasAddress: true, hasBankDetails: true } })
  })
})

describe('the thread and the task menu', () => {
  const entries = () => within(screen.getByRole('log', { name: 'Conversation' })).queryAllByRole('listitem')
  const task = (name: RegExp) => screen.getByRole('button', { name })
  const sendAndWait = async (user: ReturnType<typeof userEvent.setup>, text: string, answer: string) => {
    answers = [reply('chat', answer)]
    await say(user, text)
    await waitFor(() => expect(screen.getByText(answer)).toBeInTheDocument())
  }

  it('says nothing in the thread when a task is chosen', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(task(/Make an invoice/))
    await user.click(task(/Build the brand/))
    await user.click(task(/Get a logo/))
    expect(entries()).toHaveLength(0)
  })

  it('marks a move to another workspace with a divider, once a message is sent there', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(task(/Build the brand/))
    await sendAndWait(user, 'What suits a gift business?', 'Something warm.')
    // the first message has nothing before it to have moved from
    expect(entries().map((item) => item.className)).not.toContain('thread__divider')
    await user.click(task(/Make an invoice/))
    expect(entries()).toHaveLength(2)
    await sendAndWait(user, 'What does it need?', 'A client.')
    const items = entries()
    expect(items.map((item) => item.textContent)).toEqual([expect.stringContaining('What suits'), expect.stringContaining('Something warm.'), 'Switched workspace to Invoice', expect.stringContaining('What does it need?'), expect.stringContaining('A client.')])
    expect(items[2]).toHaveClass('thread__divider')
  })

  it('shows one divider, not one per move, when the founder moves about without saying anything', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(task(/Build the brand/))
    await sendAndWait(user, 'Hello', 'Hi.')
    await user.click(task(/Make an invoice/))
    await user.click(task(/Build the brand/))
    await user.click(task(/Get a logo/))
    await user.click(task(/Make an invoice/))
    await sendAndWait(user, 'Now?', 'Here.')
    const dividers = entries().filter((item) => item.classList.contains('thread__divider'))
    expect(dividers.map((item) => item.textContent)).toEqual(['Switched workspace to Invoice'])
  })

  it('shows no divider for a move that was made and undone before anything was said', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(task(/Build the brand/))
    await sendAndWait(user, 'Hello', 'Hi.')
    await user.click(task(/Make an invoice/))
    await user.click(task(/Build the brand/))
    await sendAndWait(user, 'Again', 'Still here.')
    expect(entries().filter((item) => item.classList.contains('thread__divider'))).toHaveLength(0)
  })

  it('does not send a divider to the composer as part of the conversation', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(task(/Build the brand/))
    await sendAndWait(user, 'Hello', 'Hi.')
    await user.click(task(/Make an invoice/))
    await sendAndWait(user, 'Next', 'Done.')
    await user.click(task(/Build the brand/))
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
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
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
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
    expect(back()).toBeInTheDocument()
  })

  it('closes a workspace nobody has changed at once, without asking', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
    await user.click(back())
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument()
  })

  it('asks first, in the thread, when the palette has changes, and saves it from a button there before it closes', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await user.click(back())
    expect(prompt()).toHaveTextContent('the brand palette')
    // nothing has been closed or saved yet
    expect(toolbar()).toBeInTheDocument()
    expect(loadPalette('duckstack')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save the palette' }))
    expect(loadPalette('duckstack')).not.toBeNull()
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(screen.getByText(/I saved the palette\. Everything is saved/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leave without saving' })).not.toBeInTheDocument()
  })

  it('closes without saving when asked to, and keeps nothing', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await user.click(back())
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }))
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(loadPalette('duckstack')).toBeNull()
    expect(screen.getByText('I closed the workspace without saving.')).toBeInTheDocument()
  })

  it('stays in the workspace when asked to keep working', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
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
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await user.click(back())
    await user.click(back())
    expect(screen.getAllByText(/You have unsaved changes in/)).toHaveLength(1)
  })

  it('opens the invoice note of what would be remembered from the button, and closes only once the founder has confirmed it', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
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
    await user.click(screen.getByRole('button', { name: /Make an invoice/ }))
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
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
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
  const entry = (name: string | RegExp) => within(screen.getByRole('dialog', { name: 'Chat history' })).getByRole('button', { name })
  const openHistory = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'History' }))
  const talk = async (user: ReturnType<typeof userEvent.setup>, text: string, answer: string) => {
    answers = [reply('chat', answer)]
    await say(user, text)
    await waitFor(() => expect(screen.getByText(answer)).toBeInTheDocument())
  }

  it('opens and closes, and says what it is for while there is nothing in it', async () => {
    const user = userEvent.setup()
    renderHome()
    await openHistory(user)
    expect(screen.getByText(/kept here once you have said something/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Chat history' })).not.toBeInTheDocument())
  })

  it('lists a conversation once something has been said in it, called by how it began', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'Help me name my business', 'Happy to.')
    await openHistory(user)
    expect(entry(/^Help me name my business/)).toHaveAttribute('aria-current', 'true')
    expect(within(screen.getByRole('dialog', { name: 'Chat history' })).getByText('Open now')).toBeInTheDocument()
  })

  it('keeps a conversation when a new one is started, and brings it back when it is opened', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'First question', 'First answer.')
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    expect(screen.queryByText('First answer.')).not.toBeInTheDocument()
    await talk(user, 'Second question', 'Second answer.')
    await openHistory(user)
    const items = within(screen.getByRole('dialog', { name: 'Chat history' })).getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('.chatbar__title')?.textContent)).toEqual(['Second question', 'First question'])
    await user.click(entry(/^First question/))
    expect(screen.getByText('First answer.')).toBeInTheDocument()
    expect(screen.queryByText('Second answer.')).not.toBeInTheDocument()
    // and the panel has closed
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Chat history' })).not.toBeInTheDocument())
  })

  it('carries on a conversation that was opened, in the same entry', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'First question', 'First answer.')
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    await openHistory(user)
    await user.click(entry(/^First question/))
    await talk(user, 'Follow up', 'Follow answer.')
    await openHistory(user)
    expect(within(screen.getByRole('dialog', { name: 'Chat history' })).getAllByRole('listitem')).toHaveLength(1)
    expect(loadChatsFor()[0].messages.map((item) => item.text)).toEqual(['First question', 'First answer.', 'Follow up', 'Follow answer.'])
  })

  it('forgets a conversation only when asked twice', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'First question', 'First answer.')
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    await talk(user, 'Second question', 'Second answer.')
    await openHistory(user)
    await user.click(screen.getByRole('button', { name: 'Delete First question' }))
    expect(screen.getByText('Delete this chat?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(within(screen.getByRole('dialog', { name: 'Chat history' })).getAllByRole('listitem')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Delete First question' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(within(screen.getByRole('dialog', { name: 'Chat history' })).getAllByRole('listitem')).toHaveLength(1)
    expect(loadChatsFor().map((chat) => chat.title)).toEqual(['Second question'])
  })

  it('starts a new conversation when the open one is deleted', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'Only question', 'Only answer.')
    await openHistory(user)
    await user.click(screen.getByRole('button', { name: 'Delete Only question' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByText('Only answer.')).not.toBeInTheDocument()
    expect(loadChatsFor()).toEqual([])
  })

  it('keeps nothing for a conversation the founder has not spoken in', async () => {
    const user = userEvent.setup()
    renderHome()
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
    await user.click(screen.getByRole('button', { name: /^Remove colour 1,/ }))
    await user.click(screen.getByRole('button', { name: 'Back to the full chat' }))
    expect(loadChatsFor()).toEqual([])
  })

  it('is in the side panel too, once a workspace is open, and does not lose the conversation going there', async () => {
    const user = userEvent.setup()
    renderHome()
    await talk(user, 'Before the workspace', 'Noted.')
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
    expect(screen.getByText('Noted.')).toBeInTheDocument()
    await openHistory(user)
    expect(entry(/^Before the workspace/)).toHaveAttribute('aria-current', 'true')
  })
})

describe('a question and suggested replies', () => {
  const asking = (message: string, question: string, replies: string[]) => ({ outcome: 'valid', turn: { task: 'ideation', message, question, replies, actions: [], memoryUsed: [] } })

  it('shows the question after the answer, and sends a tapped reply as the founder\'s own message with the question in the history', async () => {
    const user = userEvent.setup()
    answers = [
      asking('Three ways to price:\n\n- **Cost plus**\n- **Value based**', 'Do you know your costs?', ['Yes, I know them', 'Not sure yet']),
      { outcome: 'valid', turn: { task: 'ideation', message: 'Then start with cost plus.', actions: [], memoryUsed: [] } },
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
    answers = [{ outcome: 'valid', turn: { task: 'brand', message: 'Done.', question: 'Does it feel right?', actions: [{ type: 'select_colour', index: 9 }], memoryUsed: [] } }]
    renderHome()
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
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
    await user.click(screen.getByRole('button', { name: /Build the brand/ }))
    expect(backdrop(container)).toBeNull()
  })
})
