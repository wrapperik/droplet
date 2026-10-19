import type { HeadlineLine } from "../ui/headlineLines.ts";
import { beat } from "../timing.ts";

// The words of the video, from the storyboard, one card before each part of the app. Times are in beats from the
// card's start.
const at = (beats: number, text: string): HeadlineLine => ({ at: beat(beats), text });

export const TITLES = {
  homeTitle: [at(0.5, "Describe it."), at(2.5, "Or pick it."), at(4.5, "Droplet builds the screen.")],
  brandTitle: [at(0.5, "Decide your brand once."), at(2.5, "Every choice comes with a reason."), at(4.5, "Nothing saves until you confirm.")],
  logoTitle: [at(0.5, "Droplet can’t make your logo."), at(3.5, "So it tells you.")],
  invoiceTitle: [at(0.5, "Your brand. Already on it."), at(2.5, "Client details. Already there."), at(4.5, "Missing something? Flagged before you send.")],
  undoTitle: [at(0.5, "Edit it. Undo it.")],
} as const;
