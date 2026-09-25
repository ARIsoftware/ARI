#!/usr/bin/env node
/**
 * Renders index.html frame-by-frame into an H.264 MP4 (no audio).
 *
 * Usage:
 *   node marketing/intro-video/render.mjs [--fps 30] [--out ari-intro.mp4] [--from 0] [--to 60]
 *
 * Needs Playwright (Chromium) and an ffmpeg with libx264 on PATH (or FFMPEG=/path/to/ffmpeg).
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const here = path.dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((s) => s.trim().split(/\s+/)),
)
const fps = Number(args.fps ?? 30)
const out = path.resolve(args.out ?? path.join(here, 'ari-intro.mp4'))
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(pathToFileURL(path.join(here, 'index.html')).href + '?render')
await page.evaluate(() => document.fonts.ready)

const duration = await page.evaluate(() => window.DURATION)
const from = Number(args.from ?? 0)
const to = Math.min(Number(args.to ?? duration), duration)
const frames = Math.round((to - from) * fps)

const enc = spawn(
  ffmpeg,
  [
    '-y',
    '-f',
    'image2pipe',
    '-framerate',
    String(fps),
    '-i',
    '-',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '16',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    out,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
)

for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.render(t), from + i / fps)
  const png = await page.screenshot({ type: 'png' })
  if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once('drain', r))
  if (i % fps === 0) process.stdout.write(`\rframe ${i}/${frames}`)
}
enc.stdin.end()
await new Promise((r) => enc.on('close', r))
await browser.close()
console.log(`\nwrote ${out}`)
