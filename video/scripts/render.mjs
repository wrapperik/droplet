// Renders the whole video in chunks, then joins them and lays the track under them.
//
// One long render in a single browser now and then stalls on a frame for no reason of its own (the same frame renders
// at once when tried again). In chunks, a stalled chunk is simply rendered again, and the rest is not lost.
//
//   node scripts/render.mjs            renders out/droplet-launch.mp4
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AUDIO_OFFSET_SECONDS, FPS, TOTAL_FRAMES } from "../src/timing.ts";

const CHUNK = 300;
const TRIES = 3;
// The music fades out over the last second and a half, as the composition's own audio does.
const FADE_SECONDS = 1.5;

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "out");
const chunks = path.join(out, "chunks");
const target = path.join(out, "droplet-launch.mp4");
const run = (args) => execFileSync("npx", args, { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

rmSync(chunks, { recursive: true, force: true });
mkdirSync(chunks, { recursive: true });

const parts = [];
for (let start = 0; start < TOTAL_FRAMES; start += CHUNK) {
  const end = Math.min(start + CHUNK, TOTAL_FRAMES) - 1;
  const file = path.join(chunks, `${String(parts.length).padStart(2, "0")}.mp4`);
  for (let attempt = 1; ; attempt++) {
    try {
      console.log(`Frames ${start} to ${end}, attempt ${attempt}`);
      run(["remotion", "render", "src/index.ts", "DropletLaunch", file, `--frames=${start}-${end}`, "--codec=h264", "--crf=18", "--muted", "--timeout=60000"]);
      break;
    } catch (error) {
      if (attempt >= TRIES) throw error;
    }
  }
  parts.push(file);
}

const list = path.join(chunks, "list.txt");
writeFileSync(list, parts.map((file) => `file '${file}'`).join("\n"));
const seconds = TOTAL_FRAMES / FPS;
const track = path.join(root, "public", "track.mp3");
if (!existsSync(track)) throw new Error("public/track.mp3 is missing: put the music there first.");

run([
  "remotion", "ffmpeg", "-y", "-loglevel", "error",
  "-f", "concat", "-safe", "0", "-i", list,
  "-ss", String(AUDIO_OFFSET_SECONDS), "-t", String(seconds), "-i", track,
  "-map", "0:v", "-map", "1:a",
  "-af", `volume='if(gt(t,${seconds - FADE_SECONDS}),(${seconds}-t)/${FADE_SECONDS},1)':eval=frame`,
  "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-shortest", target,
]);
rmSync(chunks, { recursive: true, force: true });
console.log(`Done: ${target}`);
