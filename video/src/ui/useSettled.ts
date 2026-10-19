import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";

// Holds a render until a scene's components have read their data and drawn it. The app reads its project
// from storage after it mounts, so the first frame of a scene waits a moment for that to land.
export function useSettled(ms = 550) {
  const [handle] = useState(() => delayRender(`Settling for ${ms}ms`));
  useEffect(() => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      continueRender(handle);
    };
    const timer = window.setTimeout(release, ms);
    return () => {
      window.clearTimeout(timer);
      release();
    };
  }, [handle, ms]);
}
