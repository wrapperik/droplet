// How Droplet's messages are laid out. The model writes a small, fixed subset of Markdown and nothing else is allowed through: this
// reads it into a few typed blocks that the interface draws with its own components. It is never turned into HTML, so a message
// cannot bring markup, links or images with it. Anything it does not know stays as plain text.
//
//   a blank line         starts a new paragraph
//   - item, * item       a bulleted list
//   1. item, 1) item     a numbered list, which keeps the number it starts at
//   **words**            bold
//   # Heading            drawn as a bold paragraph, for a model that adds one anyway

export type Inline = { text: string; bold?: boolean }

export type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'bullets'; items: Inline[][] }
  | { type: 'numbers'; start: number; items: Inline[][] }

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBER = /^\s*(\d{1,3})[.)]\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/

// **bold** runs. A pair of asterisks with no partner is left as it is.
export function parseInline(text: string): Inline[] {
  const parts: Inline[] = []
  let last = 0
  for (const match of text.matchAll(/\*\*(\S(?:[^*]*\S)?)\*\*/g)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ text: match[1], bold: true })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts.length > 0 ? parts : [{ text }]
}

type OpenList = { kind: 'bullets' | 'numbers'; start: number; items: string[] }

export function parseRichText(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  // Held in an object so the checker sees it change inside the helpers below.
  const open: { list: OpenList | null } = { list: null }

  const endParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' ')) })
    paragraph = []
  }
  const endList = () => {
    const { list } = open
    if (list) {
      const items = list.items.map(parseInline)
      blocks.push(list.kind === 'bullets' ? { type: 'bullets', items } : { type: 'numbers', start: list.start, items })
    }
    open.list = null
  }
  const addItem = (kind: OpenList['kind'], text: string, number = 1) => {
    endParagraph()
    if (open.list?.kind !== kind) {
      endList()
      open.list = { kind, start: number, items: [] }
    }
    open.list!.items.push(text.trim())
  }

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    // A blank line ends a paragraph. A list carries on across it, so a loose list stays one list.
    if (line.trim() === '') {
      endParagraph()
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet) {
      addItem('bullets', bullet[1])
      continue
    }
    const numbered = NUMBER.exec(line)
    if (numbered) {
      addItem('numbers', numbered[2], Number(numbered[1]))
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      endParagraph()
      endList()
      blocks.push({ type: 'paragraph', content: [{ text: heading[1].replace(/\*\*/g, '').trim(), bold: true }] })
      continue
    }
    // An indented line under a list item carries on that item. Anything else ends the list and starts a paragraph.
    const current = open.list
    if (current && /^\s+/.test(line) && current.items.length > 0) {
      current.items[current.items.length - 1] += ` ${line.trim()}`
      continue
    }
    endList()
    paragraph.push(line.trim())
  }
  endParagraph()
  endList()
  return blocks
}
