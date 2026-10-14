import { isFrame, isNode, type BoardItem } from './boardTypes.ts'

// Droplet offered where the work is: a few canned requests for whatever is selected, each sent as the founder's own message, so it lands in the chat with
// its change receipt like any other. They are plain words, not actions: the composer reads them with the selection it is always sent, and the same rules
// apply (it cannot change a price, delete or reword the founder's things without a yes, and so on). Kept free of anything from the interface.

export type Suggestion = { id: string; label: string; text: string }

// What to offer for what is selected on the board. Nothing for a mix, an arrow, or an empty prompt (that is for fill_prompt, from the frame).
export function boardSuggestions(selected: BoardItem[]): Suggestion[] {
  const nodes = selected.filter(isNode)
  if (selected.length === 1 && isFrame(selected[0])) {
    return [
      { id: 'fill', label: 'Fill the empty prompts', text: 'Fill in the empty prompts in this frame, using what you know about my business' },
      { id: 'summarise', label: 'Summarise', text: 'Summarise what is in this frame' },
      { id: 'tidy', label: 'Tidy', text: 'Tidy this frame' },
    ]
  }
  if (selected.length === 1 && nodes.length === 1) {
    if (nodes[0].text.trim() === '') return []
    return [
      { id: 'expand', label: 'Expand', text: 'Expand this note into a few related ideas' },
      { id: 'alternatives', label: 'Alternatives', text: 'Give me a few alternatives to this note, as new notes beside it' },
      { id: 'shorter', label: 'Make it shorter', text: 'Suggest a shorter version of this note' },
    ]
  }
  if (nodes.length >= 2 && nodes.length === selected.length) {
    return [
      { id: 'group', label: 'Group', text: `Group these ${nodes.length} notes by theme` },
      { id: 'tidy', label: 'Tidy', text: `Tidy up these ${nodes.length} notes` },
      { id: 'theme', label: 'Find the theme', text: `What theme connects these ${nodes.length} notes?` },
    ]
  }
  return []
}

// What to offer for the colour that is selected in the palette. The number is the colour's place in the palette, as Droplet is shown it.
export function colourSuggestions(position: number): Suggestion[] {
  return [
    { id: 'warmer', label: 'Warmer', text: `Make colour ${position} warmer` },
    { id: 'calmer', label: 'Calmer', text: `Make colour ${position} calmer` },
    { id: 'pair', label: 'Find a pair that passes', text: `Colour ${position} does not read well against the others. Find a pair that passes the contrast check` },
  ]
}

// What to offer for a line of the invoice. Neither names a price: a price is the founder's, and only theirs.
export function lineSuggestions(position: number, description: string): Suggestion[] {
  const said = description.trim()
  return [
    { id: 'split', label: 'Split', text: `Split line ${position}${said ? ` (“${said.slice(0, 60)}”)` : ''} into separate lines. Leave the prices for me to fill in` },
    { id: 'check', label: 'Check the description', text: `Check the description of line ${position}. Is it clear enough for a client, and does it say what they are paying for?` },
  ]
}
