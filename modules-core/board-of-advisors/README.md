# Board of Advisors

Assemble a virtual board of advisor personas and put your questions to a roundtable. Every
advisor answers in turn, in your chosen speaking order, and each one sees what the advisors
before them said — so they agree, push back, and build on each other like a real board.

## Features

- **Advisor personas** — a name and a personality description is all it takes (e.g. *Steve
  Jobs: "A smart CEO who is obsessed over the details and always tells the truth."*).
- **Roundtable replies** — one question, every advisor answers in sequence, streamed live
  token-by-token via Server-Sent Events.
- **Speaking order** — drag-and-drop reordering in Settings (dnd-kit).
- **Discussion history** — conversations persist; revisit, rename, continue, or delete them.
- **Any AI provider** — powered by the shared `AiProviderCard`; keys live in
  Settings → Integrations. Claude and Gemini use native clients; OpenAI, OpenRouter, xAI,
  Mistral, DeepSeek, Groq, Perplexity, and Ollama speak the OpenAI-compatible protocol.
- **Colored-initial avatars** — auto-assigned per advisor, stable across sessions, snapshotted
  onto messages so history renders correctly even after an advisor is deleted.

## Structure

- `api/advisors` — advisor CRUD + `advisors/reorder` (speaking order)
- `api/conversations` — discussion CRUD; `conversations/[id]/messages` runs the streaming roundtable
- `api/providers` — server-resolved provider status for the header pill
- `api/settings` — module settings (JSONB merge into `module_settings`)
- `database/` — `board_advisors`, `board_conversations`, `board_messages` (RLS on all)
- `lib/providers.ts` — key resolution + unified streaming client
- `hooks/use-board-of-advisors.ts` — TanStack Query hooks + SSE consumer

## Setup

1. Enable the module at `/modules`.
2. Add an API key for a provider under Settings → Integrations.
3. Open Board of Advisors, add advisors in the onboarding (or Settings), pick the provider in
   Board of Advisors → Settings, and ask your first question.
