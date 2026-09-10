# themes-core

ARI's built-in themes. **This folder is overwritten during upgrades** — any changes
made here will be lost. To customize a core theme, copy its folder into
`themes-custom/` (same rules as `modules-core` vs `modules-custom`) and edit the
copy; a theme in `themes-custom/` whose `id` matches a core theme fully replaces it.

Each theme is a folder named after its id:

```
themes-core/<id>/
  theme.json   # required — id, name, category, order, colors (see below)
  theme.css    # optional — extra CSS scoped to [data-theme="<id>"]
  README.md    # optional — design notes
```

`theme.json` fields:

- `id` — lowercase kebab-case (`my-theme`). **Never change an existing id**: users'
  saved theme choices reference it.
- `name` — display name shown in Settings → Themes.
- `category` — `"light"` or `"dark"` (drives the `dark` class and dark-variant styles).
- `order` — sort position in the theme picker (core themes use 10, 20, … so new
  themes can slot between). Themes without an order sort last, except a
  `themes-custom` override of a core theme, which inherits the core theme's
  order when it omits one.
- `colors` — HSL component triples (`"H S% L%"`, no `hsl()` wrapper) for every token
  in `ThemeColors` (`lib/theme/types.ts`), plus `radius`. `topbarBackground` /
  `topbarForeground` are optional.
- `defaultFont` / `defaultFontSize` — optional; applied when the theme is selected
  (see the `8-bit` theme).

`theme.css` rules must be scoped to `[data-theme="<id>"]` — an unscoped selector
would leak into every theme, so the generator fails the build for unscoped core
CSS and excludes (with a warning) unscoped custom CSS.

The registry is generated into `lib/generated/theme-registry.ts` and
`lib/generated/theme-styles.css` by `scripts/generate-theme-registry.js`, which runs
automatically on every dev boot and build (via `pnpm generate-module-registry`).
After adding or editing a theme, restart ARI (or run
`pnpm generate-module-registry`) to pick it up.
