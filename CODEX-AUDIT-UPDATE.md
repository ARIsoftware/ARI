# CODEX Security Audit — Update

Date: 2025-09-03

Only issues from CODEX-AUDIT.md that remain unchanged (unresolved) are listed below.

- Input validation gaps on several routes
  - Evidence:
    - `app/api/fitness-tasks/route.ts` — `POST` and `PUT` parse `request.json()` without Zod schema validation; `DELETE` trusts query `id` without validation.
    - `app/api/contacts/[id]/route.ts` — `GET`, `PATCH`, `DELETE` accept `id` and body updates without schema/UUID validation.
  - Impact: Type/shape errors and unexpected fields can pass through; increases risk of logic bugs and injection of invalid data.
  - Recommendation: Use existing Zod helpers (`lib/validation.ts`, `lib/api-helpers`) to validate params and bodies for these endpoints.

- Missing rate limiting on API routes
  - Evidence: No limiter middleware/util found across `app/api/*` or `middleware.ts`.
  - Impact: Susceptible to abuse and brute-force on sensitive endpoints.
  - Recommendation: Add a simple token-bucket or sliding-window limiter (Edge-compatible) and apply to write/admin routes.

- CSRF posture for cookie-authenticated APIs
  - Evidence: Mutating endpoints rely on Supabase session cookies; no CSRF token checks or Authorization-bearer requirement observed.
  - Impact: If cross-site authenticated requests become possible (e.g., future CORS changes), endpoints could be at risk.
  - Recommendation: Require an anti-CSRF token for cookie flows or switch mutating routes to require `Authorization: Bearer <JWT>`.

