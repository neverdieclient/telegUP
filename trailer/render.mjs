/**
 * Grabs the trailer frames and encodes the MP4.
 *
 * The page is drawn by the in-app browser (see build.mjs for how it is made),
 * every frame is produced deterministically with `window.__seek(ms)`, so no
 * screen recorder or GPU is involved. Requires `node trailer/serve.mjs` on
 * http://localhost:5199 plus the browser tools from code mode; this file is a
 * reference of the steps and of the ffmpeg call.
 *
 * Steps (run in code mode):
 *   1. open http://localhost:5199/ in a tab, wait for body[data-ready]
 *   2. for each frame i: evaluate `__seek(i * 1000/30)` + two rAF, screenshot
 *   3. ffmpeg -framerate 30 -i frames-out/frame-%04d.png ...
 */
export const FPS = 30;
export const DURATION_MS = 26000;
export const TOTAL_FRAMES = Math.round((DURATION_MS / 1000) * FPS);

export const ffmpegArgs = (framesDir, out) => [
  "-y", "-loglevel", "error",
  "-framerate", String(FPS),
  "-i", `${framesDir}\\frame-%04d.png`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "19",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  out,
];