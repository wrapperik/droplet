import { useEffect, useLayoutEffect, useRef } from "react";

// Runs `work` after every render, and again a few times shortly after. The app's components fill in a moment after they mount (they
// read their project from storage, and header controls are drawn into slots once those exist), so a measurement or a scroll made at
// the first render can be made against a page that is not finished. The extra runs catch it finished. The render of a frame is held
// back while this settles (see useSettled), so the last run is what the frame shows.
const LATER_MS = [60, 160, 300, 450];

export function useAfterSettling(work: () => void) {
  const latest = useRef(work);

  useLayoutEffect(() => {
    latest.current = work;
    work();
  });

  useEffect(() => {
    const timers = LATER_MS.map((ms) => window.setTimeout(() => latest.current(), ms));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  });
}
