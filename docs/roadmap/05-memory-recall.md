# 05 Memory: recall of past chats

**Goal:** a new chat can draw on earlier chats, and a returning founder is greeted with where they left off. On by default, with a switch.

## Summaries
- When the founder starts or opens another chat, the chat they left (if it has founder messages and changed since its last summary) is summarised by Base in the background: subject, decided, still open, three to six lines. Stored as `summary` and `summarisedAt` on the chat in `chatStore.ts`.
- Server: add a request kind to the compose function (`kind: 'summarise_chat'`, shared with chunk 06's digest) with its own small schema and prompt. It counts toward the hourly limit, never toward Advanced.
- Check: every name or figure in the summary must appear in the chat; otherwise drop the summary.

## Use
- Each request carries at most three summaries (1,200 characters) as `<earlier_chats>`, with dates: matched on the task, words shared with the request, then recency. Word matching only for now.
- The prompt says these are memories of conversations, not confirmed facts.
- **Welcome back:** a new chat for a project with history opens with a line built in code (never by the model) from facts, the last summary and what is saved: "Welcome back to DuckStack. Last time you settled the name and started on colours, and the palette is not saved yet." with replies "Carry on with the colours" and "Something else". It is a local message, not sent as Droplet's words.

## Control
- Switch in the project brief: "Let Droplet look back at past chats". Off: no summaries sent and none written.
- Summaries can be read, edited and deleted from the chat history dialog or the project brief.

**Tests:** summary written only when needed; check drops an invented name; selection picks matching chats and caps length; switch off sends none; welcome back text from given state.
