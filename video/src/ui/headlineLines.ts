export type HeadlineLine = { at: number; text: string };

// The line that is on screen on a frame: the last one that has started. Before the first, none.
export const lineAt = (frame: number, lines: HeadlineLine[]): HeadlineLine | null => {
  let current: HeadlineLine | null = null;
  for (const line of lines) if (frame >= line.at) current = line;
  return current;
};

// The frames between one word of a line arriving and the next.
export const WORD_GAP = 3;

// The words of a line that have started arriving by a frame, each with how far along it is (0 to 1 over `arriveFrames`).
export const wordsAt = (frame: number, line: HeadlineLine, arriveFrames = 10): { word: string; progress: number }[] =>
  line.text.split(" ").map((word, index) => ({
    word,
    progress: Math.min(1, Math.max(0, (frame - line.at - index * WORD_GAP) / arriveFrames)),
  }));
