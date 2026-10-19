// The track is "REV IT UP", at about 144.75 BPM. The beat grid was worked out from the audio itself: the
// first bar starts 0.284 seconds in. Every cut and text change below is placed on that grid, so changing the BPM or
// the offset here moves the whole video with it.
export const FPS = 30;
export const BPM = 144.75;
export const BEAT_SECONDS = 60 / BPM;
export const AUDIO_OFFSET_SECONDS = 0.284;
export const BEATS_PER_BAR = 4;

// A beat or a bar, as a frame.
export const beat = (count: number) => Math.round(count * BEAT_SECONDS * FPS);
export const bar = (count: number) => beat(count * BEATS_PER_BAR);

// The video, in order: a line of words in the middle of the screen, then the app showing it, and so on. Lengths are in
// bars, so every cut lands on a downbeat. Change a length here and everything after it moves with it.
const ORDER = [
  ["homeTitle", 2],
  ["home", 4],
  ["brandTitle", 2],
  ["brand", 7],
  ["logoTitle", 2],
  ["logo", 3],
  ["invoiceTitle", 2],
  ["invoice", 6],
  ["undoTitle", 2],
  ["undo", 3],
  ["end", 3],
] as const;

export type SceneId = (typeof ORDER)[number][0];

// Where each part starts and how long it is, in beats from the start of the video.
export const SCENES = (() => {
  const scenes = {} as Record<SceneId, { from: number; beats: number }>;
  let from = 0;
  for (const [id, bars] of ORDER) {
    scenes[id] = { from, beats: bars * BEATS_PER_BAR };
    from += bars * BEATS_PER_BAR;
  }
  return scenes;
})();

export const SCENE_IDS = ORDER.map(([id]) => id);

export const TOTAL_BEATS = ORDER.reduce((sum, [, bars]) => sum + bars * BEATS_PER_BAR, 0);
export const TOTAL_FRAMES = beat(TOTAL_BEATS);

// A part's length in frames.
export const sceneFrames = (id: SceneId) => beat(SCENES[id].from + SCENES[id].beats) - beat(SCENES[id].from);

// A part's own frame, counted in beats from its start (a fraction is fine).
export const beatsIn = (frame: number) => frame / (BEAT_SECONDS * FPS);
