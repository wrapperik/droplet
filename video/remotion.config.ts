/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { Config } from "@remotion/cli/config";

Config.setRspack(true);
// PNG frames: a JPEG capture once came back as a tiled, corrupted frame.
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);

// Remotion's bundled Chrome stops on one of its own internal checks (a container query) when the app changes layout
// between frames. A release build of Google Chrome does not, so it is used to render when it is installed.
const RELEASE_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (existsSync(RELEASE_CHROME)) {
  Config.setChromeMode("chrome-for-testing");
  Config.setBrowserExecutable(RELEASE_CHROME);
  // With several tabs at once, that Chrome now and then returns a frame as a tiling of one corner. One tab does not.
  Config.setConcurrency(1);
}

// The video mounts the app's own components from ../src. They must share this
// project's single copy of React, or hooks break across the two copies.
Config.overrideBundlerConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...config.resolve?.alias,
      react: path.join(process.cwd(), "node_modules/react"),
      // `react-dom` itself is the stand-in that keeps the app's dialogs inside the video (see src/shims/reactDom.ts).
      "react-dom$": path.join(process.cwd(), "src/shims/reactDom.ts"),
      "react-dom/client": path.join(process.cwd(), "node_modules/react-dom/client"),
      "react-dom/server": path.join(process.cwd(), "node_modules/react-dom/server"),
    },
  },
}));
