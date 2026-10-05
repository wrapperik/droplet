import { describeBlocks, checkBlocks, blockSchema, type ChatBlock } from './blocks.ts'
import { checkReply } from './compose.ts'
import { doneSteps, describeProject, JOURNEY_STEPS, OPEN_PHRASE, STEP_WORKSPACE, type ProjectSnapshot } from './journey.ts'
import { buildUserContent, BOARD_SYSTEM_PROMPT, INVOICE_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompt.ts'
import { snapshotOfProject } from './project.ts'
import { checkOpening } from './rules.ts'
import { boardTurnSchema } from './boardSpec.ts'
import { invoiceTurnSchema } from './invoiceSpec.ts'
import { composeRequestSchema, routedTo, turnSchema, type AnyTurn } from './spec.ts'
import { openSnapshot } from './fixtures.ts'
import { emptyMemory, withIdea, withInvoice } from '../lib/projectMemory.ts'
import { newContent } from '../lib/invoice.ts'

const project = (over: Partial<ProjectSnapshot> = {}): ProjectSnapshot => ({
  projectName: 'DuckStack',
  businessName: '',
  offer: '',
  hasPalette: false,
  hasBusinessDetails: false,
  clients: 0,
  invoices: 0,
  boardItems: 0,
  ...over,
})

const reply = (over: Record<string, unknown> = {}) => JSON.stringify({ task: 'chat', message: 'Hello!', actions: [], memoryUsed: [], ...over })
const palette = { type: 'set_palette', colours: [{ hex: '#111111' }, { hex: '#EEEEEE' }, { hex: '#336699' }].map((c, i) => ({ ...c, name: `C${i}`, rationale: 'Suits it.' })), reason: 'The palette.' }

describe('opening a workspace is the founder\'s decision', () => {
  const asked = { intent: 'Make me a colour palette for DuckStack' }

  it('refuses a palette with nothing open when the reply does not say the founder asked', () => {
    const errors = checkReply(reply({ task: 'brand', actions: [palette] }), { intent: 'I want to create a dev studio called DuckStack' }).errors
    expect(errors[0]).toMatch(/this reply opens the palette but has no opens/)
  })

  it('refuses a quote that is not in what the founder wrote, however it is dressed', () => {
    const turn = reply({ task: 'brand', actions: [palette], opens: { because: 'asked', quote: 'make me a palette' } })
    expect(checkReply(turn, { intent: 'I want to create a dev studio called DuckStack' }).errors[0]).toMatch(/is not in the founder's message/)
  })

  it('accepts a palette with nothing open when the founder asked outright, and the quote is theirs', () => {
    const turn = reply({ task: 'brand', actions: [palette], opens: { because: 'asked', quote: 'make me a colour palette' } })
    expect(checkReply(turn, asked).errors).toEqual([])
  })

  it('compares quotes the way a person would: capitals, punctuation and curly quotes do not matter', () => {
    const turn = (quote: string) => reply({ task: 'brand', actions: [palette], opens: { because: 'asked', quote } })
    expect(checkReply(turn('MAKE ME a colour palette!'), asked).errors).toEqual([])
    expect(checkReply(turn("let’s do it"), { intent: "Yes, let's do it", history: [{ role: 'droplet', text: 'Shall we?' }] }).errors).toEqual([])
  })

  it('does not take "agreed" without an offer earlier in the conversation', () => {
    const turn = reply({ task: 'brand', actions: [palette], opens: { because: 'agreed', quote: 'yes please' } })
    expect(checkReply(turn, { intent: 'yes please' }).errors.join(' ')).toMatch(/needs an earlier offer/)
    expect(checkReply(turn, { intent: 'yes please', history: [{ role: 'founder', text: 'hi' }, { role: 'droplet', text: 'Shall I open the palette?' }] }).errors).toEqual([])
  })

  it('needs the quote for a workspace opened by naming its task, too, and then routes', () => {
    const open = { task: 'invoice', message: 'Opening the invoice workspace.', actions: [], memoryUsed: [], opens: { because: 'asked', quote: 'Open the invoice workspace' } }
    const checked = checkReply(JSON.stringify(open), { intent: 'Open the invoice workspace' })
    expect(checked.errors).toEqual([])
    expect(routedTo(checked.turn as AnyTurn, undefined)).toBe('invoice')
    expect(checkReply(JSON.stringify({ ...open, opens: { because: 'asked', quote: 'invoice my first client' } }), { intent: 'Open the invoice workspace' }).errors[0]).toMatch(/is not in the founder's message/)
  })

  it('does not ask for the quote when a palette is already on screen: the founder is working in it', () => {
    expect(checkOpening({ task: 'brand', message: 'Done.', actions: [{ type: 'set_colour', index: 1, hex: '#123456' }], memoryUsed: [] }, { intent: 'darker', view: 'brand' })).toEqual([])
  })

  it('leaves a plain conversation alone', () => {
    expect(checkReply(reply({ question: 'How far along are you?' }), { intent: 'I want to create a dev studio called DuckStack' }).errors).toEqual([])
  })

  it('never routes a reply that does not carry opens, however it names the task', () => {
    for (const task of ['brand', 'invoice', 'ideation']) {
      const turn = checkReply(reply({ task, question: 'Shall I open it?' }), { intent: 'hi' }).turn as AnyTurn
      expect(routedTo(turn, undefined)).toBeNull()
    }
  })
})

describe('a reply that says it is opening a workspace must open it', () => {
  const named = (task: string, over: Record<string, unknown> = {}) => reply({ task, message: 'Opening it now.', ...over })

  it('is refused when it names a workspace that is not on screen, does nothing, asks nothing and has no opens', () => {
    for (const task of ['brand', 'invoice', 'ideation']) {
      expect(checkReply(named(task), { intent: 'hi' }).errors[0]).toMatch(/names a workspace's task but does nothing and asks nothing/)
    }
  })

  it('is fine as a conversation: with a question, as chat, or on the workspace that is already on screen', () => {
    expect(checkReply(named('invoice', { question: 'Shall I open the invoice?' }), { intent: 'hi' }).errors).toEqual([])
    expect(checkReply(named('chat'), { intent: 'hi' }).errors).toEqual([])
    expect(checkReply(named('brand'), { intent: 'hi', view: 'brand', workspace: openSnapshot() }).errors).toEqual([])
    expect(checkReply(named('brand'), { intent: 'hi', workspace: openSnapshot() }).errors).toEqual([])
  })

  it('is fine when it opens with the founder\'s words', () => {
    expect(checkReply(named('invoice', { opens: { because: 'asked', quote: 'open the invoice' } }), { intent: 'Open the invoice' }).errors).toEqual([])
  })
})

describe('the order of a reply\'s fields', () => {
  it('puts opens after actions in every schema: the model writes fields in order, and forgot opens when it came first', () => {
    for (const schema of [turnSchema, invoiceTurnSchema, boardTurnSchema]) {
      const keys = Object.keys(schema.shape)
      expect(keys.indexOf('opens')).toBeGreaterThan(keys.indexOf('actions'))
    }
  })
})

describe('opening and asking whether to open', () => {
  it('is refused when a reply opens the palette and then asks whether to open it', () => {
    const turn = reply({ task: 'brand', actions: [palette], opens: { because: 'asked', quote: 'make me a colour palette' }, question: 'Shall I open the brand workspace?' })
    expect(checkReply(turn, { intent: 'Make me a colour palette for DuckStack' }).errors[0]).toMatch(/do not ask whether to open it/)
    const fine = reply({ task: 'brand', actions: [palette], opens: { because: 'asked', quote: 'make me a colour palette' }, question: 'Does the palette feel right?' })
    expect(checkReply(fine, { intent: 'Make me a colour palette for DuckStack' }).errors).toEqual([])
  })
})

describe('saying what you are doing is not asking', () => {
  const open = (quote: string) => checkReply(reply({ task: 'brand', actions: [palette], opens: { because: 'asked', quote } }), { intent: quote }).errors

  it('refuses a quote that only describes what the founder is working on, even though it is theirs', () => {
    for (const quote of ['Working on branding', "I'm building the brand", 'we have a brand to do', 'Im busy with colours']) {
      expect(open(quote)[0], quote).toMatch(/is a statement, not a request or an agreement/)
    }
  })

  it('accepts a request, in any wording, including a bare thing asked for', () => {
    for (const quote of ['Colour palette', 'Make me a palette', 'I am working on branding, can you make colours', 'Brand colours please', 'palette for my bakery']) {
      expect(open(quote), quote).toEqual([])
    }
  })

  it('holds an agreement to it too: a statement is not a yes, but a yes is', () => {
    const agreed = (quote: string) => checkReply(reply({ task: 'brand', actions: [palette], opens: { because: 'agreed', quote } }), { intent: quote, history: [{ role: 'droplet', text: 'Shall we?' }] }).errors
    expect(agreed('Working on branding')[0]).toMatch(/is a statement, not a request or an agreement/)
    expect(agreed('Yes please')).toEqual([])
    expect(agreed("Let's do it")).toEqual([])
    expect(agreed('Go on then')).toEqual([])
  })
})

describe('descriptions are never sent as words', () => {
  it('refuses a message or question that is a description in square brackets, or a written-out plan, and leaves ordinary brackets alone', () => {
    expect(checkReply(reply({ message: '[A warm reaction to the business and its name.]' }), { intent: 'hi' }).errors[0]).toMatch(/not a description in square brackets/)
    expect(checkReply(reply({ message: 'Here it is.', question: '[How far along they are, asked fresh?]' }), { intent: 'hi' }).errors[0]).toMatch(/^question:/)
    expect(checkReply(reply({ message: '[Plan "Your plan": 1. Settle the name]' }), { intent: 'hi' }).errors[0]).toMatch(/A plan or a table goes in blocks/)
    expect(checkReply(reply({ message: 'Fees run about R175 [CIPC, 2026] for a private company.' }), { intent: 'hi' }).errors).toEqual([])
  })
})

describe('a question is asked once', () => {
  const asked = (message: string, question = 'What do you already have?') => {
    const checked = checkReply(reply({ message, question }), { intent: 'hi' })
    expect(checked.errors).toEqual([])
    return checked.turn!.message
  }

  it('is mended, not refused, when the message asks it too: a trailing question is taken off', () => {
    expect(asked('Lovely. What do you already have?')).toBe('Lovely.')
    expect(asked('Lovely! Do you have a logo? Or colours?')).toBe('Lovely!')
    expect(asked('Good start.\n\nWhat do you already have?')).toBe('Good start.')
  })

  it('leaves everything else alone: a message with no question, a list, and a message that is only a question', () => {
    expect(asked('Lovely, a good place to start.')).toBe('Lovely, a good place to start.')
    expect(asked('Options:\n- **One**: cheap\n- **Two**: is it better?')).toBe('Options:\n- **One**: cheap\n- **Two**: is it better?')
    expect(asked('What do you already have?')).toBe('What do you already have?')
  })

  it('does nothing when there is no question beside the message', () => {
    expect(checkReply(reply({ message: 'Does that sound right? It should.' }), { intent: 'hi' }).turn?.message).toBe('Does that sound right? It should.')
  })
})

describe('the shared illustrations in every prompt', () => {
  // The shared section comes last in every prompt, one reply to a line.
  const lines = (prompt: string) => prompt.slice(prompt.indexOf('Illustrations of guiding')).split('\n').filter((line) => line.startsWith('{"task"')).map((line) => JSON.parse(line) as AnyTurn)

  it('are the same in all three prompts, so every workspace is taught the same way of guiding', () => {
    const [brand, invoice, board] = [SYSTEM_PROMPT, INVOICE_SYSTEM_PROMPT, BOARD_SYSTEM_PROMPT].map((prompt) => lines(prompt))
    expect(brand.length).toBeGreaterThanOrEqual(4)
    expect(invoice).toEqual(brand)
    expect(board).toEqual(brand)
  })

  it('include a plan, a table, a push for the logo and an opening that quotes the founder', () => {
    const turns = lines(SYSTEM_PROMPT)
    expect(turns.some((turn) => turn.blocks?.some((block) => block.type === 'checklist' && block.numbered))).toBe(true)
    expect(turns.some((turn) => turn.blocks?.some((block) => block.type === 'table'))).toBe(true)
    expect(turns.some((turn) => turn.task === 'invoice' && turn.actions.length === 0 && !turn.opens && turn.replies?.includes('Invoice anyway'))).toBe(true)
    expect(turns.some((turn) => turn.opens?.because === 'agreed')).toBe(true)
  })

  it('describe what to write instead of giving sentences to copy, apart from the blocks, whose shape is the lesson', () => {
    const turns = lines(SYSTEM_PROMPT).filter((turn) => !turn.opens && !turn.blocks?.some((block) => block.type === 'table'))
    for (const turn of turns) expect(turn.message, turn.message).toMatch(/^\[/)
  })

  it('teach nothing the app would refuse in shape: each opening passes the rules for the situation it shows', () => {
    const opening = lines(SYSTEM_PROMPT).find((turn) => turn.opens?.because === 'agreed')!
    const history = [{ role: 'droplet' as const, text: 'Shall we do the colours?' }]
    expect(checkReply(JSON.stringify(opening), { intent: opening.opens!.quote, history }).errors).toEqual([])
    for (const turn of lines(SYSTEM_PROMPT).filter((candidate) => !candidate.opens && candidate.actions.length === 0 && candidate.blocks)) {
      expect(checkBlocks(turn.blocks)).toEqual([])
    }
  })
})

describe('what the prompts teach about Droplet and guiding', () => {
  it.each([
    ['brand', SYSTEM_PROMPT],
    ['invoice', INVOICE_SYSTEM_PROMPT],
    ['board', BOARD_SYSTEM_PROMPT],
  ])('the %s prompt knows the app, the journey, the opening rule, the invoice push, logos and blocks', (_name, prompt) => {
    expect(prompt).toMatch(/Three workspaces are built/)
    expect(prompt).toMatch(/Not built yet, so never offer them as if they exist/)
    expect(prompt).toMatch(/Droplet does not make logos or any images/)
    expect(prompt).toMatch(/1\. name \(the board\)/)
    expect(prompt).toMatch(/do not open anything and do not list options/)
    expect(prompt).toMatch(/Never open one because you think it would help/)
    expect(prompt).toMatch(/Telling you about their business, their plans or what they are doing is not asking for anything to be made/)
    expect(prompt).toMatch(/Do not ask permission for what they just asked for/)
    expect(prompt).toMatch(/not to opening anything: begin with your context question/)
    expect(prompt).toMatch(/copied exactly/)
    expect(prompt).toMatch(/Push once/)
    expect(prompt).toMatch(/Push hardest for the logo/)
    expect(prompt).toMatch(/You cannot draw, generate or edit a logo/)
    expect(prompt).toMatch(/do not send them to a designer/)
    expect(prompt).toMatch(/Canva or Adobe Express/)
    expect(prompt).toMatch(/signing up/)
    expect(prompt).toMatch(/"blocks" puts up to two things under your message/)
    expect(prompt).toMatch(/Do not open anything yet/)
    expect(prompt).toMatch(/calm, capable friend, not a cheerleader/)
    expect(prompt).toMatch(/never use "wonderful", "brilliant"/)
    expect(prompt).toMatch(/"Working on branding"/)
    expect(prompt).not.toContain('—')
  })

  it('tells the palette prompt, and only that one, that with nothing open a palette action opens it', () => {
    expect(SYSTEM_PROMPT).toMatch(/with nothing open, a set_palette action opens it, with opens set/)
    expect(INVOICE_SYSTEM_PROMPT).not.toContain('set_palette')
    expect(BOARD_SYSTEM_PROMPT).not.toContain('set_palette')
  })

  it('points founders to a free tool for a logo, and does not tell them to hire a designer', () => {
    const logo = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf('Logos\n'), SYSTEM_PROMPT.indexOf('Showing things in the chat'))
    expect(logo).toMatch(/free plan/)
    expect(logo).toMatch(/A designer is only worth a mention if they say they have the budget/)
    expect(SYSTEM_PROMPT).not.toMatch(/made by a designer or a logo tool/)
    expect(SYSTEM_PROMPT).not.toMatch(/walk into a designer/)
  })

  it('tells it the exact words a tap on an Open button arrives as', () => {
    for (const phrase of Object.values(OPEN_PHRASE)) expect(SYSTEM_PROMPT).toContain(`"${phrase}"`)
  })

  it('no longer tells it to open a palette just because none is open', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/If no workspace is open and they ask for a palette, brand colours or a look for the business, open it/)
  })
})

describe('the project, as the composer is told it', () => {
  it('is put in the request when there is one, and left out when there is not', () => {
    expect(buildUserContent({ intent: 'hi', project: project({ businessName: 'DuckStack' }) })).toMatch(/<project>[\s\S]*"businessName": "DuckStack"[\s\S]*<\/project>/)
    expect(buildUserContent({ intent: 'hi' })).not.toContain('<project>')
  })

  it('says which steps the project holds and which only the founder can say', () => {
    const described = JSON.stringify(describeProject(project({ businessName: 'DuckStack', hasPalette: true })))
    expect(described).toContain('"step":"name","what":"Settle the name","status":"in the project"')
    expect(described).toContain('"step":"palette","what":"Choose the colours","status":"in the project"')
    expect(described).toContain('"step":"invoice","what":"Make the first invoice","status":"not in the project yet"')
    expect(described).toContain('"step":"logo","what":"Get a logo","status":"not tracked by the app: go by what the founder has said"')
  })

  it('ticks only what it can tell: the name, the palette and an invoice', () => {
    expect([...doneSteps(project())]).toEqual([])
    expect([...doneSteps(project({ businessName: 'DuckStack', hasPalette: true, invoices: 1 }))].sort()).toEqual(['invoice', 'name', 'palette'])
    expect([...doneSteps(undefined)]).toEqual([])
  })

  it('maps every step to a workspace that exists, or to none', () => {
    expect(JOURNEY_STEPS.map((step) => STEP_WORKSPACE[step])).toEqual(['board', 'board', 'brand', null, 'invoice', null])
    expect(Object.keys(OPEN_PHRASE).sort()).toEqual(['board', 'brand', 'invoice'])
  })

  it('is read from what the project remembers: the decided name, else the business name; counts, never details', () => {
    let memory = withIdea(emptyMemory(), 'name', 'DuckStack', '2026-10-06T10:00')
    memory = withIdea(memory, 'offer', 'Web apps for small businesses', '2026-10-06T10:00')
    memory = withInvoice(memory, 'i1', newContent('2026-10-06', 'INV-0001'), '2026-10-06T10:00')
    const snapshot = snapshotOfProject({ projectName: 'DuckStack', memory, hasPalette: true, boardItems: 5 })
    expect(snapshot).toEqual({ projectName: 'DuckStack', businessName: 'DuckStack', offer: 'Web apps for small businesses', hasPalette: true, hasBusinessDetails: true, clients: 0, invoices: 1, boardItems: 5 })
    expect(composeRequestSchema.safeParse({ intent: 'hi', project: snapshot }).success).toBe(true)
    expect(snapshotOfProject({ projectName: 'x', memory: emptyMemory(), hasPalette: false, boardItems: 0 }).businessName).toBe('')
  })
})

describe('blocks', () => {
  const plan: ChatBlock = {
    type: 'checklist',
    title: 'Your plan',
    numbered: true,
    items: [{ label: 'Settle the name', step: 'name' }, { label: 'Choose the colours', step: 'palette', done: true }, { label: 'Buy a domain' }],
  }
  const table: ChatBlock = { type: 'table', title: 'Names', columns: ['Name', 'Feel'], rows: [['DuckStack', 'Playful'], ['Pond', 'Calm']] }

  it('are a table or a checklist, and nothing else, at most two a reply', () => {
    expect(blockSchema.safeParse(plan).success).toBe(true)
    expect(blockSchema.safeParse(table).success).toBe(true)
    expect(blockSchema.safeParse({ type: 'html', html: '<b>x</b>' }).success).toBe(false)
    expect(turnSchema.safeParse({ task: 'chat', message: 'x', actions: [], memoryUsed: [], blocks: [plan, table, plan] }).success).toBe(false)
    expect(turnSchema.safeParse({ task: 'chat', message: 'x', actions: [], memoryUsed: [], blocks: [plan, table] }).success).toBe(true)
  })

  it('keep a table to two to four columns, a checklist to two to eight items, and a step to one place on a list', () => {
    expect(blockSchema.safeParse({ ...table, columns: ['Only'], rows: [['a']] }).success).toBe(false)
    expect(blockSchema.safeParse({ ...plan, items: [{ label: 'One' }] }).success).toBe(false)
    expect(checkBlocks([{ ...plan, items: [{ label: 'a', step: 'name' }, { label: 'b', step: 'name' }] } as ChatBlock])[0]).toMatch(/only once/)
  })

  it('send back a row with the wrong number of cells', () => {
    const bad: ChatBlock = { ...table, rows: [['DuckStack', 'Playful', 'Extra'] as unknown as [string, string]] } as ChatBlock
    expect(checkBlocks([bad])[0]).toMatch(/has 3 cells but the table has 2 columns/)
    expect(checkBlocks([table, plan])).toEqual([])
    expect(checkReply(reply({ blocks: [bad] }), { intent: 'x' }).errors[0]).toMatch(/blocks\.0\.rows\.0/)
  })

  it('are put into words for the next request, with what is done and what the founder ticked', () => {
    expect(describeBlocks([plan, table], undefined, new Set(['name']))).toBe(
      '[Plan "Your plan": 1. Settle the name (done); 2. Choose the colours (done); 3. Buy a domain]\n[Table "Names": Name | Feel; DuckStack | Playful; Pond | Calm]',
    )
    expect(describeBlocks([plan], { '0:2': true, '0:0': false })).toBe('[Plan "Your plan": 1. Settle the name; 2. Choose the colours (done); 3. Buy a domain (done)]')
    expect(describeBlocks(undefined, undefined)).toBe('')
  })
})
