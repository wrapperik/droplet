// The rounded box the app is shown in, almost the whole frame. The camera pans and zooms inside it, so nothing of the app
// ever reaches beyond its edge.
export const WINDOW = { x: 60, y: 60, w: 1800, h: 960 };

// The app is laid out as it would be in a 1920 pixel wide browser window, and drawn a little smaller to fit the box, so its
// columns have the room they have on a desktop screen.
export const APP_WIDTH = 1920;
export const APP_SCALE = WINDOW.w / APP_WIDTH;
export const APP_HEIGHT = WINDOW.h / APP_SCALE;
