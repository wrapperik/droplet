import { MotionGlobalConfig } from "framer-motion";
import { getRemotionEnvironment } from "remotion";
import "@fontsource-variable/google-sans";
import "../../src/styles/global.css";
import "./stage.css";
import { useThemeStore } from "../../src/store/theme.ts";
import { installSeed } from "./seed.ts";

// Imported once, first, by the root. The app's components are drawn exactly as they are in the product, so
// this only does what a frame-by-frame render needs: finish every motion at once and give the components a
// project to read.
MotionGlobalConfig.skipAnimations = true;

// Smooth scrolling runs on the clock too: a thread that scrolls to its newest message would be part of the way there on one
// frame and somewhere else on the next. Every scroll the app asks for lands at once instead.
const instant = <T extends ScrollToOptions | ScrollIntoViewOptions>(options: T | boolean | undefined) =>
  options && typeof options === "object" ? { ...options, behavior: "instant" as ScrollBehavior } : options;
const scrollTo = Element.prototype.scrollTo;
Element.prototype.scrollTo = function (this: Element, ...args: unknown[]) {
  return Reflect.apply(scrollTo, this, args.length === 1 ? [instant(args[0] as ScrollToOptions)] : args);
} as typeof Element.prototype.scrollTo;
const scrollIntoView = Element.prototype.scrollIntoView;
Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) {
  return scrollIntoView.call(this, instant(options));
};
installSeed();

// While a video is rendered, the page itself cannot be scrolled by the app's focus calls, which would move the whole frame.
if (getRemotionEnvironment().isRendering) {
  document.documentElement.style.overflow = "clip";
  document.body.style.overflow = "clip";
}

// The video shows the app in its dark theme throughout. Setting it the way the theme switch does also marks
// "Dark" as the choice in the sidebar.
useThemeStore.getState().setPreference("dark");
