import type { ReactNode } from "react";
// The real react-dom, by its file, so this works wherever the bundler's own aliases do not reach (the Studio's dev
// server). The file has no types beside it: react-dom's own types are what everything else uses.
// @ts-expect-error No declaration file beside the JavaScript.
import * as realModule from "../../node_modules/react-dom/index.js";
// @ts-expect-error No declaration file beside the JavaScript.
export * from "../../node_modules/react-dom/index.js";

const real = realModule as typeof import("react-dom");

// The app draws some dialogs (the logo card) into `document.body`, which is the whole page. In the Studio and the
// Player, the page is not the video, so such a dialog would cover the player's own controls. This stands in for
// `react-dom` in the video's bundle (see remotion.config.ts) and sends what was bound for the body into the video's
// frame instead, while a scene has named that frame (see PortalHost). Everything else passes through untouched.
let frame: Element | null = null;

export const setPortalFrame = (element: Element | null) => {
  frame = element;
};

export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null) {
  return real.createPortal(children, container === document.body && frame ? frame : container, key);
}

// Some packages import `react-dom` as a default export.
export default { ...real, createPortal };
