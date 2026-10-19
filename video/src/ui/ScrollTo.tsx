import { useEffect, useRef } from "react";
import { useAfterSettling } from "./useAfterSettling.ts";

// Moves one of the app's panes down its content by a share of how far it can go (0 is the top, 1 the foot), so a frame
// decides how far down the pane is. It draws nothing.
//
// It does not scroll the pane. A scroll position can be moved by anything in the page (a focus call scrolls to what it
// focuses), and the browser drops it for a moment whenever the content is redrawn, which showed as single frames that
// jumped. Instead the pane is set to clip, so it cannot scroll at all, and its content is slid up with a transform.
export default function ScrollTo({ selector, share }: { selector: string; share: number }) {
  const latest = useRef(share);

  const apply = () => {
    const pane = document.querySelector<HTMLElement>(selector);
    if (!pane) return;
    if (pane.style.overflowY !== "clip") pane.style.overflowY = "clip";
    const children = Array.from(pane.children) as HTMLElement[];
    // The content's own height, unscaled: the pane is a flex column, so it is the last child's foot below the pane's top.
    const last = children[children.length - 1];
    if (!last) return;
    const contentHeight = last.offsetTop + last.offsetHeight - pane.offsetTop + parseFloat(getComputedStyle(pane).paddingBottom || "0");
    const offset = Math.round(latest.current * Math.max(0, contentHeight - pane.clientHeight));
    const value = offset === 0 ? "" : `0 ${-offset}px`;
    for (const child of children) if (child.style.translate !== value) child.style.translate = value;
  };

  useAfterSettling(() => {
    latest.current = share;
    apply();
  });

  useEffect(() => {
    const changed = () => apply();
    const mutations = new MutationObserver(changed);
    const sizes = new ResizeObserver(changed);
    let watched: HTMLElement | null = null;
    // The pane can appear a moment after this mounts (the workspace draws into the header's slots first), so look for it
    // until it is there.
    const find = window.setInterval(() => {
      const pane = document.querySelector<HTMLElement>(selector);
      if (!pane || pane === watched) return;
      watched = pane;
      mutations.observe(pane, { childList: true, subtree: true, characterData: true });
      sizes.observe(pane);
      for (const child of Array.from(pane.children)) sizes.observe(child);
      apply();
    }, 30);
    return () => {
      window.clearInterval(find);
      mutations.disconnect();
      sizes.disconnect();
    };
    // `apply` reads the latest share from a ref, so it does not need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector]);

  return null;
}
