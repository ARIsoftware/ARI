# Motivation Page Black Boxes Fix Plan

## Root Cause Summary
- The overlays in `modules/motivation/app/page.tsx` still rely on the removed Tailwind v1/v2 `bg-opacity-*` utilities (lines ~99, ~128, ~167).
- Tailwind 3.4 ignores those classes, so each overlay defaults to solid `bg-black`, leaving the motivation cards rendered as opaque black rectangles.

## Implementation Steps
1. **Update Overlay Classes**
   - Replace `bg-black bg-opacity-0 hover:bg-opacity-40` with `bg-black/0 hover:bg-black/40` in the YouTube and Twitter card overlays.
   - Replace the inner hover circle’s `bg-black bg-opacity-75` with `bg-black/75` in those same blocks.
   - Change the Instagram overlay wrapper from `bg-black bg-opacity-0 hover:bg-opacity-30` to `bg-black/0 hover:bg-black/30`.
2. **Audit for Legacy Utilities**
   - Search the file for any remaining `bg-opacity-*` usage and convert to the slash-opacity syntax to prevent future regressions.
3. **Tailwind Content (if needed)**
   - Confirm `tailwind.config.ts` already scans `./modules/**/*.{ts,tsx,js,jsx}`; add that glob if missing so the new class forms are included during builds.

## Validation
- Run `pnpm dev`, open `/motivation`, and verify the grid renders thumbnails/gradients with the intended hover play affordances instead of black boxes.
- Spot-check hover states to confirm the overlay transitions work with the updated classes.
