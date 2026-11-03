/**
 * Module-scoped CSS for the chat UI — the shimmer used by live status lines
 * and uploading attachments (the shadcn chat components ship it as a
 * Tailwind 4 utility; ARI is on Tailwind 3). React 19 hoists and dedupes a
 * `<style href precedence>` so this renders once however often it's mounted.
 */

const CSS = `
@keyframes chat-shimmer {
  from { background-position: 100% 0; }
  to { background-position: 0% 0; }
}
.chat-shimmer,
[data-slot="attachment"]:is([data-state="uploading"], [data-state="processing"]) [data-slot="attachment-title"] {
  color: transparent;
  background-image: linear-gradient(
    90deg,
    hsl(var(--muted-foreground)) 0%,
    hsl(var(--muted-foreground)) 40%,
    hsl(var(--foreground)) 50%,
    hsl(var(--muted-foreground)) 60%,
    hsl(var(--muted-foreground)) 100%
  );
  background-size: 250% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  animation: chat-shimmer 2.2s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .chat-shimmer,
  [data-slot="attachment"] [data-slot="attachment-title"] { animation: none; }
}
`

export function ChatStyles() {
  return (
    <style href="ari-chat-styles" precedence="default">
      {CSS}
    </style>
  )
}
