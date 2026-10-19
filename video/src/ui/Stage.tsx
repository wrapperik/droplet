import type { ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { APP_HEIGHT, APP_SCALE, APP_WIDTH, WINDOW } from "./window.ts";
import { useSettled } from "./useSettled.ts";
import { cameraAt, cameraShift, type CameraMove } from "./motion.ts";

type Props = {
  children: ReactNode;
  camera?: CameraMove[];
  // Shown over the window and not moved by the camera: the pointer.
  overlay?: ReactNode;
  settle?: number;
};

export default function Stage({ children, camera, overlay, settle = 550 }: Props) {
  const frame = useCurrentFrame();
  useSettled(settle);
  const { scale, fx, fy } = camera ? cameraAt(frame, camera) : { scale: 1, fx: 0.5, fy: 0.5 };
  // The point looked at is carried to the middle of the box as the app grows round it, never past the box's edges.
  const shift = cameraShift({ scale, fx, fy }, { windowW: WINDOW.w, windowH: WINDOW.h, left: 0, boxW: WINDOW.w, boxH: WINDOW.h });

  return (
    <div className="vid-root" style={{ position: "absolute", inset: 0, overflow: "clip" }}>
      {/* The rounded box, with a fine Droplet blue edge. The camera moves inside it. It clips rather than hides what is
          outside it: a hidden overflow can still be scrolled, and the app's focus calls would scroll it sideways. */}
      <div
        style={{
          position: "absolute",
          left: WINDOW.x,
          top: WINDOW.y,
          width: WINDOW.w,
          height: WINDOW.h,
          borderRadius: "var(--radius-lg)",
          border: "1.5px solid color-mix(in srgb, var(--focus) 70%, transparent)",
          overflow: "clip",
          boxShadow: "0 0 80px color-mix(in srgb, var(--focus) 18%, transparent), var(--shadow-lg)",
          background: "var(--shell)",
          isolation: "isolate",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: `${fx * 100}% ${fy * 100}%`,
            translate: `${shift.x}px ${shift.y}px`,
            scale: String(scale),
          }}
        >
          <div
            className="vid-window"
            style={{ position: "absolute", left: 0, top: 0, width: APP_WIDTH, height: APP_HEIGHT, transformOrigin: "0 0", scale: String(APP_SCALE) }}
          >
            {children}
          </div>
        </div>
      </div>
      {overlay}
    </div>
  );
}
