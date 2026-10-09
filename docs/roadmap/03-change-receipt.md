# 03 Change receipt and how changes arrive

**Goal:** every reply that changed something shows what changed, with Undo this and Show me, and the changes visibly arrive in order.

## Receipt
- Under a Droplet message that applied actions, a compact card: a heading ("Changed on the board"), one line per change ("+ 5 notes in Name ideas", "3 notes moved to Customers", "Colour 2 made darker") and one line per thing left out, with the reason.
- Built in code from the applied actions (the apply functions return what they did), never from the model's words. The "I could not do everything" text moves into the receipt as left-out lines.
- **Undo this** takes back that turn. If the history has moved on since, it says so and points to the workspace's Undo.
- **Show me** brings the changed things into view and plays the ripple on each (below).
- Kept with the message in the saved chat (the lines, not the ability to undo after reload).

## Arrival
- Changes appear in the order of the actions: new things emerge (`Emerge.tsx`) 60 to 80 ms apart, moved things glide on the existing springs, removed things shrink and fade. Cap the sequence at about 1 s.
- Each changed thing gets one soft ring in `--focus` that spreads and fades (300 ms). Show me replays it.
- Reduced motion: no sequence, no ring motion; a static outline for 1 s instead.

**Tests:** receipt lines for each action type in each workspace; left-out lines; Undo this restores the state before the turn; Undo this after later edits says so; receipt saved with the chat.
