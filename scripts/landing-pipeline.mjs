#!/usr/bin/env node
/**
 * AVLpoint landing media pipeline.
 *
 *   node scripts/landing-pipeline.mjs posters
 *     Build chapter posters from the Higgsfield stills in media/landing-src
 *     (the pre-clip stage — posters are later refreshed from clip frames).
 *
 *   node scripts/landing-pipeline.mjs frames [ch01 ch02 ...]
 *     Extract scroll-scrub frames from clips in media/landing-clips/chNN.mp4:
 *       public/landing/frames/chNN/f_%03d.webp    (1600px, desktop)
 *       public/landing/frames-m/chNN/f_%03d.webp  (960px, mobile)
 *     then rewrite src/components/landing/frame-manifest.json and refresh the
 *     chapter poster from the clip's first frame. With no args, every clip
 *     found in media/landing-clips is processed.
 *
 * Sources in media/ stay out of git; frames/posters in public/ ship with the site.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const ROOT = process.cwd();
const SRC = path.join(ROOT, "media", "landing-src");
const CLIPS = path.join(ROOT, "media", "landing-clips");
const POSTERS = path.join(ROOT, "public", "landing", "posters");
const FRAMES = path.join(ROOT, "public", "landing", "frames");
const FRAMES_M = path.join(ROOT, "public", "landing", "frames-m");
const MANIFEST = path.join(ROOT, "src", "components", "landing", "frame-manifest.json");
const FPS = 12;

/** chapter -> [still file, optional crop {zoom, x, y}] for the poster stage */
const POSTER_SOURCES = {
  ch01: ["still-hero.png", null],
  ch02: ["still-problem.png", null],
  ch03: ["still-platform.png", null],
  ch04: ["still-platform.png", { zoom: 1.35, x: 0.5, y: 0.62 }],
  ch05: ["still-platform.png", { zoom: 1.2, x: 0.25, y: 0.5 }],
  ch06: ["still-globe.png", null],
  ch07: ["still-inspector.png", null],
  ch08: ["still-architecture.png", null],
  ch09: ["still-architecture.png", { zoom: 1.3, x: 0.6, y: 0.4 }],
  ch10: ["still-hero.png", { zoom: 1.12, x: 0.5, y: 0.45 }],
};

async function posterFromStill(key, [file, crop]) {
  const src = path.join(SRC, file);
  let img = sharp(src);
  if (crop) {
    const meta = await img.metadata();
    const cw = Math.round(meta.width / crop.zoom);
    const ch = Math.round(meta.height / crop.zoom);
    img = img.extract({
      left: Math.min(meta.width - cw, Math.round((meta.width - cw) * crop.x)),
      top: Math.min(meta.height - ch, Math.round((meta.height - ch) * crop.y)),
      width: cw,
      height: ch,
    });
  }
  await img.resize({ width: 1600 }).webp({ quality: 74 }).toFile(path.join(POSTERS, `${key}.webp`));
  console.log(`poster ${key} ← ${file}${crop ? " (crop)" : ""}`);
}

async function extractChapter(key) {
  const input = path.join(CLIPS, `${key}.mp4`);
  const outD = path.join(FRAMES, key);
  const outM = path.join(FRAMES_M, key);
  for (const d of [outD, outM]) {
    await rm(d, { recursive: true, force: true });
    await mkdir(d, { recursive: true });
  }
  const common = ["-y", "-i", input, "-an", "-sn"];
  await run(ffmpegPath, [
    ...common,
    "-vf", `fps=${FPS},scale=1600:-2`,
    "-c:v", "libwebp", "-quality", "72", "-preset", "picture", "-compression_level", "4",
    path.join(outD, "f_%03d.webp"),
  ]);
  await run(ffmpegPath, [
    ...common,
    "-vf", `fps=${FPS},scale=960:-2`,
    "-c:v", "libwebp", "-quality", "62", "-preset", "picture", "-compression_level", "4",
    path.join(outM, "f_%03d.webp"),
  ]);
  const count = (await readdir(outD)).filter((f) => f.endsWith(".webp")).length;
  // keep the poster in perfect sync with the film
  await sharp(path.join(outD, "f_001.webp"))
    .webp({ quality: 74 })
    .toFile(path.join(POSTERS, `${key}.webp`));
  console.log(`frames ${key}: ${count} @ ${FPS}fps (desktop+mobile), poster refreshed`);
  return count;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  await mkdir(POSTERS, { recursive: true });

  if (cmd === "posters") {
    for (const [key, spec] of Object.entries(POSTER_SOURCES)) {
      await posterFromStill(key, spec);
    }
    return;
  }

  if (cmd === "frames") {
    let keys = args;
    if (!keys.length) {
      keys = (await readdir(CLIPS).catch(() => []))
        .filter((f) => /^ch\d\d\.mp4$/.test(f))
        .map((f) => f.replace(".mp4", ""))
        .sort();
    }
    if (!keys.length) {
      console.error("no clips found in media/landing-clips");
      process.exit(1);
    }
    const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
    for (const key of keys) {
      manifest.chapters[key] = await extractChapter(key);
    }
    manifest.fps = FPS;
    await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
    console.log("manifest updated:", JSON.stringify(manifest.chapters));
    return;
  }

  console.error("usage: node scripts/landing-pipeline.mjs <posters|frames> [ch01 ...]");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
