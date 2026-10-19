import { describe, expect, it } from "vitest";
import { lineAt, wordsAt } from "./headlineLines.ts";
import { POINTER, cameraAt, cameraShift, pointerFrame, typedAt } from "./motion.ts";

describe("typedAt", () => {
  it("types the text out between two frames", () => {
    expect(typedAt(0, "Invoice", 10, 20)).toBe("");
    expect(typedAt(15, "Invoice", 10, 20)).toBe("Invo");
    expect(typedAt(30, "Invoice", 10, 20)).toBe("Invoice");
  });
});

describe("cameraAt", () => {
  const moves = [
    { at: 0, scale: 1 },
    { at: 30, scale: 2, fx: 0.8, fy: 0.2, frames: 10 },
  ];

  it("holds a framing until the next move starts", () => {
    expect(cameraAt(29, moves)).toEqual({ scale: 1, fx: 0.5, fy: 0.5 });
  });

  it("arrives at the next framing and stays", () => {
    expect(cameraAt(40, moves)).toEqual({ scale: 2, fx: 0.8, fy: 0.2 });
    expect(cameraAt(500, moves)).toEqual({ scale: 2, fx: 0.8, fy: 0.2 });
  });

  it("is part of the way there in between", () => {
    const mid = cameraAt(35, moves);
    expect(mid.scale).toBeGreaterThan(1);
    expect(mid.scale).toBeLessThan(2);
  });
});

describe("cameraShift", () => {
  const geometry = { windowW: 1800, windowH: 912, left: 60, boxW: 1920, boxH: 912 };

  it("does not move the window when it looks at the middle", () => {
    const { x, y } = cameraShift({ scale: 1, fx: 0.5, fy: 0.5 }, geometry);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });

  it("never lets a zoomed window pull away from the edges of the box", () => {
    const { x, y } = cameraShift({ scale: 1.5, fx: 0.95, fy: 0.95 }, geometry);
    // The window's right edge, after scaling about the focus and shifting, still reaches the box's right edge.
    const right = geometry.left + x + 0.95 * geometry.windowW * (1 - 1.5) + geometry.windowW * 1.5;
    expect(right).toBeGreaterThanOrEqual(geometry.boxW - 0.001);
    const bottom = y + 0.95 * geometry.windowH * (1 - 1.5) + geometry.windowH * 1.5;
    expect(bottom).toBeGreaterThanOrEqual(geometry.boxH - 0.001);
  });
});

describe("pointerFrame", () => {
  const stops = [
    { at: 100, x: 400, y: 300, click: true },
    { at: 130, x: 600, y: 300, click: true },
    { at: 400, x: 900, y: 700, click: true },
  ];

  it("is off the screen between visits", () => {
    expect(pointerFrame(0, stops)).toBeNull();
    expect(pointerFrame(250, stops)).toBeNull();
  });

  it("comes in beside the button and lands on it on the frame of the click", () => {
    const early = pointerFrame(100 - POINTER.approach, stops)!;
    expect(early.x).toBeGreaterThan(400);
    expect(early.y).toBeGreaterThan(300);
    expect(pointerFrame(100, stops)).toMatchObject({ x: 400, y: 300, opacity: 1 });
  });

  it("travels to a click close behind the last, without leaving", () => {
    expect(pointerFrame(115, stops)!.opacity).toBe(1);
    expect(pointerFrame(130, stops)).toMatchObject({ x: 600, y: 300 });
  });

  it("never heads for a corner: every position is near one of its buttons", () => {
    for (let frame = 0; frame < 500; frame++) {
      const at = pointerFrame(frame, stops);
      if (!at) continue;
      expect(at.x).toBeGreaterThanOrEqual(400);
      expect(at.y).toBeGreaterThanOrEqual(300);
    }
  });

  it("presses for a few frames after a click and no longer", () => {
    expect(pointerFrame(100, stops)!.press).toBe(0);
    expect(pointerFrame(105, stops)!.press).toBeGreaterThan(0);
    expect(pointerFrame(112, stops)!.press).toBe(-1);
  });
});

describe("lineAt", () => {
  const lines = [
    { at: 0, text: "One" },
    { at: 50, text: "Two" },
  ];

  it("shows the last line that has started", () => {
    expect(lineAt(10, lines)?.text).toBe("One");
    expect(lineAt(50, lines)?.text).toBe("Two");
  });

  it("shows nothing before the first line", () => {
    expect(lineAt(-1, lines)).toBeNull();
  });
});

describe("wordsAt", () => {
  const line = { at: 10, text: "Describe it now" };

  it("brings the words in one after another", () => {
    const early = wordsAt(14, line);
    expect(early[0].progress).toBeGreaterThan(0);
    expect(early[2].progress).toBe(0);
    const late = wordsAt(60, line);
    expect(late.map((entry) => entry.progress)).toEqual([1, 1, 1]);
  });

  it("keeps the words in order", () => {
    expect(wordsAt(10, line).map((entry) => entry.word)).toEqual(["Describe", "it", "now"]);
  });
});
