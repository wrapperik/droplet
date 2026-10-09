# 11 Progress and calm replies

**Goal:** the founder sees what Droplet is doing while it works, and replies arrive calmly. Advanced (about 8 s) needs this.

## Progress
- The compose endpoint (dev server and Edge Function) streams server-sent events with the stage only, never content, then the validated reply. Stages: reading the workspace, searching the web for "<query>" (from grounding metadata), checking the reply, trying again, opening a workspace.
- Beside the droplet loader: the stage in words, plus seconds elapsed after 5 s ("Searching the web · 6s"), in an `aria-live="polite"` region.
- `composeClient.ts` reads the stream, with a fallback to the plain JSON response.
- Advanced: the loader and ripple glow a slightly deeper blue and slower.
- A Stop button while working: the request is abandoned and nothing is applied.

## Calm replies
Once validated, the reply reveals paragraph by paragraph (120 ms apart), then blocks, then the question, then the suggested replies. Reduced motion: shown at once.

## Small additions
Edit on the founder's last message; Try again on Droplet's last reply (replaces it); Copy on replies and tables.

**Tests:** event parsing; fallback to JSON; Stop applies nothing; Try again replaces the reply; Edit resends.
