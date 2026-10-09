# 10 Inline AI and nudges

**Goal:** the AI is offered where the work is, and the composer's hints follow what the founder is doing. Nudges are in the capstone build.

## Inline AI on the selection
A row of suggestions on the selection bar (board `SelectionBar.tsx`, palette colour, invoice line), each sending a canned request with the selection, landing in the chat with its receipt:

| Selected | Suggestions |
|---|---|
| One note | Expand, Alternatives, Make it shorter (suggested edit), Use as name |
| Several notes | Group, Tidy, Find the theme |
| A frame | Fill the empty prompts, Summarise, Tidy |
| A colour | Warmer, Calmer, Find a pair that passes |
| An invoice line | Split, Check the description |

Plus a small "Ask about this" field.

## The composer reads the room
- Placeholder follows the context: "Ask about the 2 selected notes", "Who is this invoice for?", "Describe the feeling you want".
- A selection chip in the intent bar: "2 notes selected", with a cross that clears the selection.
- Suggestion chips above the bar from the stage and the workspace, in code: empty board "Brainstorm names · Customer template · Interview me"; invoice with no client "Use a saved client"; palette saved "Make the logo brief".

## Nudges
Computed in code, offered once, never acted on until pressed, no model call: text on background fails contrast ("Fix the contrast?"); 12 or more loose notes ("Group these?"); an invoice ready but not exported ("Export INV-0007?"). Shown as a chip above the composer; dismissing one keeps it away for that workspace.

**Tests:** suggestions per selection kind; placeholder and chips from given state; each nudge's condition; dismissed nudges stay dismissed.
