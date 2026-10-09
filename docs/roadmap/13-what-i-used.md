# 13 What Droplet used

**Goal:** under each reply, a quiet line saying what Droplet was given, so founders can see why it knew something.

- "Used: business name, saved palette, your board notes from 13 October". Pressing it opens a short list of exactly what was sent, in the app's words, and what was not: "Not sent: addresses, contact details, bank details".
- Built in code from the request that was sent (workspace, facts, summaries, notes, search), never from the model's `memoryUsed`.
- Kept with the message in the saved chat.

**Tests:** the list matches the request for each workspace; the not-sent line always shows.
