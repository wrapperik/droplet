import { buildReceipt, focusOf, leftOutLine, markOf, plural, receiptSchema, type Change } from './receipt.ts'

const added: Change = { kind: 'added', text: '5 notes in “Name ideas”', focus: [{ kind: 'item', id: 'a', how: 'added' }, { kind: 'item', id: 'b', how: 'added' }] }
const moved: Change = { kind: 'changed', text: '3 notes moved to a new frame', focus: [{ kind: 'item', id: 'b', how: 'moved' }, { kind: 'item', id: 'c', how: 'moved' }] }
const removed: Change = { kind: 'removed', text: 'Colour 2 removed', focus: [{ kind: 'block', id: 2, how: 'removed' }] }

describe('building a receipt', () => {
  it('has a heading that names the workspace, one line for each change with a sign only for what was added or removed, and one for each thing left out', () => {
    const receipt = buildReceipt('board', [added, moved, removed], [{ action: { type: 'add_note' }, reason: 'There is no clear place beside n3.' }])!
    expect(receipt.heading).toBe('Changed on the board')
    expect(receipt.lines).toEqual([
      { mark: '+', text: '5 notes in “Name ideas”' },
      { mark: '', text: '3 notes moved to a new frame' },
      { mark: '-', text: 'Colour 2 removed' },
    ])
    expect(receipt.left).toEqual(['Adding a note: There is no clear place beside n3.'])
  })

  it('names the palette, the invoice and the board in the heading', () => {
    expect(buildReceipt('brand', [added], [])!.heading).toBe('Changed on the palette')
    expect(buildReceipt('invoice', [added], [])!.heading).toBe('Changed on the invoice')
  })

  it('says nothing changed when only things were left out, so the reasons are not lost', () => {
    const receipt = buildReceipt('invoice', [], [{ action: { type: 'add_line' }, reason: 'The price R450 is not in what the founder wrote.' }])!
    expect(receipt.heading).toBe('Nothing changed on the invoice')
    expect(receipt.lines).toEqual([])
    expect(receipt.left).toHaveLength(1)
  })

  it('is nothing when nothing changed and nothing was left out', () => {
    expect(buildReceipt('board', [], [])).toBeNull()
  })

  it('is held to a number of lines, and a receipt it makes is one that can be kept', () => {
    const many = Array.from({ length: 45 }, (_, index) => ({ ...added, text: `Line ${index}` }))
    const receipt = buildReceipt('board', many, Array.from({ length: 14 }, () => ({ action: { type: 'connect' }, reason: 'no' })))!
    expect(receipt.lines).toHaveLength(30)
    expect(receipt.left).toHaveLength(10)
    expect(receiptSchema.safeParse(receipt).success).toBe(true)
  })
})

describe('the words of a receipt', () => {
  it('marks only an addition and a removal', () => {
    expect(markOf('added')).toBe('+')
    expect(markOf('removed')).toBe('-')
    expect(markOf('changed')).toBe('')
  })

  it('counts in the singular and the plural', () => {
    expect(plural(1, 'note')).toBe('1 note')
    expect(plural(5, 'note')).toBe('5 notes')
    expect(plural(0, 'colour')).toBe('0 colours')
  })

  it('gives a thing left out something to hang its reason on, and a plain word for an action it does not know', () => {
    expect(leftOutLine({ type: 'set_colour' }, 'There is no colour 9.')).toBe('Changing a colour: There is no colour 9.')
    expect(leftOutLine({ type: 'unknown_thing' }, 'No.')).toBe('One thing: No.')
  })
})

describe('what the changes touched', () => {
  it('is each thing once, in the order the changes were made, a thing added and then moved still being new', () => {
    const targets = focusOf([added, moved])
    expect(targets.map((target) => `${target.id}:${target.how}`)).toEqual(['a:added', 'b:added', 'c:moved'])
  })

  it('is nothing for no changes', () => {
    expect(focusOf([])).toEqual([])
  })
})
