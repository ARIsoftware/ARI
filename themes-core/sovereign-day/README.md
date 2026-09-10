# Sovereign Day

Navy chrome around a white workspace with blue-tinted cards. This is ARI's default
theme (`DEFAULT_THEME_ID` in `lib/theme/presets.ts`) — do not remove or rename it.

Design notes (moved from the inline comments in the old `lib/theme/presets.ts`):

- White workspace: `colors.background` drives the main content area and the
  breadcrumb bar (the header element is `bg-background`).
- Cards are a near-white tint of the workspace (`210 40% 98%`) with navy text —
  barely separated from the white page, so panels read as raised paper rather than
  coloured blocks. `theme.css` paints their border a slightly darker tint of the
  same blue (`214 32% 91%`) so the edge stays visible without hardening into a
  grey rule.
- Chrome stays the navy of the Sovereign theme. `colors.topbarBackground` is
  consumed by the announcement bar above the breadcrumbs, not by the breadcrumb
  header itself (that one is `bg-background`, i.e. white).
- `theme.css` also defines `--task-toggle-accent` (Sovereign blue) — an opt-in
  token read by `modules-core/tasks/components/task-row-actions.tsx` and
  `privacy-pin-toggle.tsx` for enabled pin / privacy-eye toggles.
- Several `theme.css` selectors match on Tailwind class substrings
  (`[class*="bg-card"]`, `[class*="bg-[#f7fafc]"]`, `.topbar[class*="h-[45px]"]`,
  `[class*="dark:bg-transparent"][class*="dark:shadow-none"]`). If those
  components are restyled these rules can silently stop matching — re-check cards,
  the dashboard rail pill, the announcement bar divider, and pinned task rows
  after UI refactors.
