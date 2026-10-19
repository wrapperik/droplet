# Droplet launch video

A one-minute launch video, made with [Remotion](https://www.remotion.dev). It alternates a line of words in the middle of
the screen with the app showing it, and ends on the wordmark. The app on screen is the product itself: the scenes mount
the real components from `../src` (the brainstorm board, the brand and invoice workspaces, the logo card, the chat), fed
from a made-up project. Every cut and change of words sits on the beat of the track.

Remotion has its own `package.json` here, so none of this reaches the app's dependencies or its build.

## Run it

```bash
cd video
npm install
```

Put the music at `public/track.mp3` (it is git-ignored: the track is licensed music). Then:

```bash
npm run dev
```

opens the Studio. `DropletLaunch` is the whole video, and each part opens on its own as `Scene-<part>`.

```bash
npx remotion render src/index.ts DropletLaunch out/droplet-launch.mp4 --codec=h264 --crf=18
```

renders a 1920 by 1080 MP4 at 30 fps into `out/`, in about ten minutes.

It renders with Google Chrome when it is installed (see `remotion.config.ts`). Remotion's own bundled Chrome stops on one of
its internal checks when the app changes layout between frames. Google Chrome is used with one tab at a time: with several, it
now and then returns a frame as a tiling of one corner of the picture.

## How it is put together

- `src/timing.ts`: the beat grid (144.75 BPM, first bar 0.284 s into the track) and the parts in order, in bars. Change a
  length here and everything after it moves.
- `src/scenes/titles.ts`: the words, by part.
- `src/scenes/`: one file for each part of the app. Each works out what the app should look like on a frame (the notes on the
  board, the palette, the invoice's lines, which step is open) and hands that to the real component.
- `src/seed.ts`: the made-up business, Kindred Gifting, held in memory through the app's own storage driver.
- `src/ui/`: the background, the box the app sits in and its camera, the pointer, and the words.
- `src/stage.css`: stops CSS transitions, animations, smooth scrolling and scrollbars, none of which can follow a frame.

## Things to know

- Money on the invoice is the app's own whole-cent arithmetic. The video adds none.
- The pointer finds the real buttons by selector, appears just before each click and fades away after it.
- Remotion is free for individuals and teams of up to three. A larger company needs a licence.
