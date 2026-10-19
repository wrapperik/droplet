import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";

// The board opens at half size, where a note's words are too small for a video. Its own Zoom in button is pressed once, as
// soon as it is on the page, and the view is then moved so the frame of notes is in the middle, as a person would scroll to it.
export default function ZoomInOnce() {
  // The frame is held until the board is zoomed and centred, so no frame shows it before.
  const [handle] = useState(() => delayRender("Zooming the board"));
  useEffect(() => {
    let zoomed = false;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      continueRender(handle);
    };
    const settle = window.setInterval(() => {
      const viewport = document.querySelector<HTMLElement>(".board__viewport");
      const frame = document.querySelector<HTMLElement>('[data-item-id="f1"]');
      if (!viewport || !frame) return;
      if (!zoomed) {
        document.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.click();
        zoomed = true;
        return;
      }
      // Measured on screen, where the video's scaling applies, and turned back into the viewport's own pixels.
      const view = viewport.getBoundingClientRect();
      const box = frame.getBoundingClientRect();
      const toPage = viewport.offsetWidth / view.width;
      viewport.scrollLeft += (box.left + box.width / 2 - (view.left + view.width / 2)) * toPage;
      viewport.scrollTop += (box.top + box.height / 2 - (view.top + view.height * 0.52)) * toPage;
      window.clearInterval(settle);
      // One more frame of the browser's, so the scroll is drawn before the frame is taken.
      requestAnimationFrame(release);
    }, 40);
    return () => {
      window.clearInterval(settle);
      release();
    };
  }, [handle]);
  return null;
}

