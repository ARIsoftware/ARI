# ARI Theme System

ARI's visual themes are file-based, mirroring the module system's core/custom split:

| Folder | Purpose | On upgrade |
|---|---|---|
| `themes-core/<id>/` | Built-in themes shipped with ARI | **Overwritten** — never edit |
| `themes-custom/<id>/` | Your themes (untracked, local) | **Preserved** |

A theme in `themes-custom/` whose `id` matches a core theme **fully replaces it**
(colors and CSS). New ids are added to the picker. To customize a core theme:

```bash
cp -R themes-core/sovereign-day themes-custom/sovereign-day
# edit themes-custom/sovereign-day/theme.json, then restart ARI
```

## Anatomy of a theme

```
themes-custom/<id>/
  theme.json   # required
  theme.css    # optional — extra CSS scoped to [data-theme="<id>"]
  README.md    # optional — design notes
```

### theme.json

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "category": "dark",
  "order": 25,
  "colors": {
    "background": "222 47% 11%",
    "foreground": "210 40% 98%",
    "...": "every token in ThemeColors (lib/theme/types.ts)",
    "radius": "0.5rem"
  },
  "defaultFont": "space-grotesk",
  "defaultFontSize": "13.5px"
}
```

- **`id`** — lowercase kebab-case, must match the folder name. **Never change an
  existing id**: users' saved theme selections (`module_settings` +
  localStorage) reference it, and a rename orphans them.
- **`name`** — display name in Settings → Themes.
- **`category`** — `"light"` or `"dark"`; drives the `dark` class on `<html>` and
  every `dark:` Tailwind variant.
- **`order`** *(optional)* — position in the theme grid and the topbar picker
  cycle. Core themes use 10, 20, … 180, so `25` slots a theme between Dark and
  Blueprint. Omitted: the theme sorts after all ordered themes (an override of a
  core theme inherits that theme's order instead).
- **`colors`** — HSL component triples in the shadcn convention (`"H S% L%"` —
  no `hsl()` wrapper) for all 33 required tokens of `ThemeColors`
  (`lib/theme/types.ts`), plus optional `topbarBackground`/`topbarForeground`.
- **`defaultFont` / `defaultFontSize`** *(optional)* — applied whenever the theme
  is activated (the `8-bit` theme uses `press-start-2p` at `11px`). Font ids come
  from `lib/theme/fonts.ts`.

### theme.css

For styling beyond color tokens (background patterns, per-component fixes).
Every selector must be scoped to your theme:

```css
[data-theme="my-theme"] main {
  background-image: repeating-linear-gradient(/* … */);
}
```

Scoping is enforced: an unscoped selector would leak into every theme, so a
`themes-custom` theme.css containing one (including inside `@media`/`@supports`
blocks, or as any member of a comma-separated list) is **excluded from the
build with a warning** — the theme's colors still load, only its CSS is
dropped. In `themes-core` an unscoped selector fails the build. See
`themes-core/grayscale/theme.css` (page filter),
`themes-core/terminal/theme.css` (topbar accent), and
`themes-core/sovereign/theme.css` (component-level re-theming) for real examples.

Themes can also opt into component-provided hooks, e.g.
`--task-toggle-accent` (read by the tasks module's pin/privacy toggles) — see
`themes-core/sovereign-day/theme.css`.

## How it works

`scripts/generate-theme-registry.js` scans `themes-custom/` then `themes-core/`
and compiles everything into two generated (gitignored) artifacts:

- `lib/generated/theme-registry.ts` — the `THEME_PRESETS` array, inlined (no
  runtime filesystem reads, so it works on serverless deploys).
- `lib/generated/theme-styles.css` — all winning `theme.css` files concatenated,
  imported globally by `app/layout.tsx` after `globals.css`.

It runs as part of `pnpm generate-module-registry`, which fires automatically on
`pnpm dev`/`pnpm build` (predev/prebuild), on every dev-server boot
(`instrumentation.ts`), in CI, and in `./ari doctor`. **After adding or editing a
theme, restart ARI** (or run `pnpm generate-module-registry`) — themes are
compiled in at startup, not read live.

**Self-hosted production note**: a production server (`pnpm build && pnpm start`)
bakes themes into the build — the dev-boot regeneration is skipped when
`NODE_ENV=production`. After changing themes there, run `pnpm build` again and
restart; restarting alone won't pick them up.

Validation rules:

- A broken theme in `themes-custom/` is **skipped with a warning** — a bad user
  theme never breaks boot. A theme whose colors are valid but whose `theme.css`
  is broken or unscoped keeps its colors and loses only the CSS.
- Color values are checked for the `"H S% L%"` format (`radius` excepted) —
  hex or `hsl()`-wrapped values pasted from a design tool are rejected with a
  clear message instead of rendering as broken CSS.
- A broken theme in `themes-core/` **fails the build** — the shipped set must be
  valid, and the ids `default`, `dark`, `light`, and `sovereign-day` must always
  exist (the app hardcodes them).

## Notes

- **Vercel / forks**: `themes-custom/` is untracked, like `modules-custom/`. If
  you deploy from your own fork, commit your themes-custom folder or it won't be
  in the deployment.
- **DB-stored custom themes**: independent of this system, per-user theme
  customizations can live in the database (`module_settings`, `customThemes`).
  File-based themes are shared by every user of the install and can carry CSS;
  DB themes are per-user color-only variants.
- The theme grid (Settings → Themes) and the topbar palette-cycle button pick up
  file-based themes automatically — no registration beyond the folder.
