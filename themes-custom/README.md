1. All ARI core themes are placed in the themes-core folder. The themes-core folder is overwritten during upgrades, and any changes made in themes-core will be lost.

2. All custom themes you build or add must be placed in the themes-custom folder. The themes-custom folder is preserved during upgrades.

3. To modify a core theme, duplicate its folder into the themes-custom folder and make your changes there. If a theme with the same id exists in both folders, only the version in themes-custom will be loaded. This provides a safe way to customize core themes without losing changes during upgrades.

## Creating a theme

Each theme is a folder named after its id:

```
themes-custom/<id>/
  theme.json   # required
  theme.css    # optional — extra CSS scoped to [data-theme="<id>"]
```

The easiest start is copying a core theme, e.g. `cp -R themes-core/dark themes-custom/my-theme`, then editing `theme.json`: set a new lowercase kebab-case `id` (matching the folder name), a display `name`, `category` (`"light"` or `"dark"`), and the `colors` — HSL component triples (`"H S% L%"`, no `hsl()` wrapper) for every token listed in `lib/theme/types.ts`. See `themes-core/README.md` for the full field reference.

After adding or editing a theme, restart ARI (`./ari start`) or run `pnpm generate-module-registry` — themes are compiled into the app at startup, not read live. Your theme then appears in Settings → Themes automatically. On a self-hosted production server (`pnpm build && pnpm start`), themes are baked in at build time — run `pnpm build` again after theme changes; restarting alone won't pick them up.

Notes:

- A broken custom theme is skipped with a warning at startup; it never breaks ARI. If only the `theme.css` is broken (or contains selectors not scoped to your `[data-theme="<id>"]`), the theme's colors still load and just the CSS is excluded.
- Color values must be HSL component triples (`"222 47% 11%"`) — hex or `hsl(...)` values are rejected at generation with a clear message.
- If you deploy to Vercel from your own fork, commit your themes-custom folder — like modules-custom, untracked local files don't reach the deployment.
