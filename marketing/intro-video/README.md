# ARI intro video

A 60-second, silent 1920×1080 intro for ARI.Software (`ari-intro.mp4`), built as an HTML page and rendered one frame at a time.

| Time | Scene |
|---|---|
| 0–8s | Hero: "Your productivity OS, on your own server." + `./ari start` |
| 8–20s | "Everything is a module." with `module.json` being typed |
| 20–32s | Database / storage / AI / themes grid: "Your stack. Swap one line." |
| 32–43s | `/ari-create-module` builds a module in the terminal |
| 43–52s | "Also in ARI" statements |
| 52–60s | Outro: ARI.Software, Premier Personal Productivity. |

## Edit

- Open `index.html` in a browser to preview it on a loop.
- The timeline is deterministic: `window.render(t)` paints the frame at `t` seconds. Scene timings are in `SCENES`, and each element's entrance delay is in its `data-in` attribute.

## Render

Needs Playwright (Chromium) and an ffmpeg build with libx264.

```bash
node marketing/intro-video/render.mjs                  # → marketing/intro-video/ari-intro.mp4
node marketing/intro-video/render.mjs --from 20 --to 32 --out grid.mp4
FFMPEG=/path/to/ffmpeg node marketing/intro-video/render.mjs
```

Fonts are Inter and JetBrains Mono (SIL Open Font License), bundled in `fonts/`.
