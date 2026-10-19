import { describe, expect, it } from "vitest";
import { BEAT_SECONDS, FPS, SCENES, SCENE_IDS, TOTAL_BEATS, TOTAL_FRAMES, bar, beat, beatsIn, sceneFrames } from "./timing.ts";

describe("the beat grid", () => {
  it("is 144.75 BPM, so a beat is about 12.4 frames at 30 fps", () => {
    expect(BEAT_SECONDS * FPS).toBeCloseTo(12.43, 1);
    expect(beat(1)).toBe(12);
    expect(bar(1)).toBe(beat(4));
  });

  it("turns a frame back into beats", () => {
    expect(beatsIn(0)).toBe(0);
    expect(beatsIn(beat(8))).toBeCloseTo(8, 0);
  });

  it("runs about a minute", () => {
    expect(TOTAL_FRAMES / FPS).toBeGreaterThanOrEqual(45);
    expect(TOTAL_FRAMES / FPS).toBeLessThanOrEqual(65);
  });
});

describe("the parts", () => {
  it("follow one another with no gap and no overlap", () => {
    let next = 0;
    for (const id of SCENE_IDS) {
      expect(SCENES[id].from).toBe(next);
      next = SCENES[id].from + SCENES[id].beats;
    }
    expect(next).toBe(TOTAL_BEATS);
  });

  it("begin and end on the bar line, so a cut always lands on a downbeat", () => {
    for (const id of SCENE_IDS) {
      expect(SCENES[id].from % 4).toBe(0);
      expect(SCENES[id].beats % 4).toBe(0);
    }
  });

  it("alternate a line of words with the app showing it", () => {
    SCENE_IDS.slice(0, -1).forEach((id, index) => expect(id.endsWith("Title")).toBe(index % 2 === 0));
  });

  it("add up to the whole video, frame for frame", () => {
    expect(SCENE_IDS.reduce((sum, id) => sum + sceneFrames(id), 0)).toBe(TOTAL_FRAMES);
  });
});
