import type { ThreadMessage } from "../../../src/components/ChatThread.tsx";
import { openBoard, type BoardItem } from "../../../src/lib/boardState.ts";

// The brainstorm board, as the home part opens it and the brand part fills it in.

export const BRAINSTORM_MESSAGE = "Brainstorm how Kindred Gifting should feel";

export const BOARD_THREAD: ThreadMessage[] = [
  { id: 1, from: "you", text: BRAINSTORM_MESSAGE },
  { id: 2, from: "droplet", text: "Here is a board to think on. Put your ideas on it, and I will add one of my own in pink." },
];

const note = (id: string, text: string, colour: "yellow" | "mint" | "sky" | "lilac" | "peach" | "pink", x: number, y: number): BoardItem => ({
  id,
  kind: "note",
  text,
  colour,
  author: colour === "pink" ? "ai" : "you",
  x,
  y,
  w: 340,
  h: 300,
});

// The notes go up one at a time, by beat. The board opens on its middle, so they are laid out round it.
const BOARD_NOTES: { at: number; item: BoardItem }[] = [
  { at: 0.6, item: note("n1", "Handmade gift boxes", "yellow", 1580, 1060) },
  { at: 1.3, item: note("n2", "Made by Pretoria makers", "mint", 2010, 1060) },
  { at: 2.0, item: note("n3", "Warm, friendly, honest", "sky", 2440, 1060) },
  { at: 2.7, item: note("n4", "For small businesses and their clients", "lilac", 2870, 1060) },
  { at: 3.4, item: note("n5", "Ordered by Thursday, delivered by Friday", "peach", 1580, 1480) },
  { at: 4.1, item: note("n6", "Calm, not loud", "yellow", 2010, 1480) },
  { at: 5.0, item: note("n7", "Soft pink and cream feel warm and handmade. A pastel yellow adds a little sunshine.", "pink", 2440, 1480) },
];

const FRAME: BoardItem = { id: "f1", kind: "frame", title: "How Kindred Gifting should feel", colour: "white", x: 1500, y: 960, w: 1800, h: 900 };

export const boardAt = (b: number) => openBoard([FRAME, ...BOARD_NOTES.filter((entry) => b >= entry.at).map((entry) => entry.item)]);
