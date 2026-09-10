# Sovereign

Deep navy with near-white text, matching the ARI website.

Design notes (moved from the inline comments in the old `lib/theme/presets.ts`):

- Cards are white surfaces floating on the navy background — `colors.card` is
  `0 0% 100%` with `cardForeground` deep blue. Because most card surfaces are raw
  `bg-card` divs whose text inherits the global `--foreground` (near-white here),
  `theme.css` re-scopes foreground/muted/border/primary **inside** card surfaces so
  inherited text stays readable on white.
- The `theme.css` selectors match on Tailwind class substrings
  (`[class*="bg-card"]`, `[class*="dark:bg-transparent"]`,
  `[class*="border-border bg-transparent"]`) used by the tasks module and dashboard
  components. If those components are restyled, these rules can silently stop
  matching — re-check pinned task rows and list-view subtask rows after any tasks
  UI refactor.
