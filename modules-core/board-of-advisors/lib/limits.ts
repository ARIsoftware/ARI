/**
 * Field limits shared by the client forms (maxLength + inline validation) and
 * the server Zod schemas in validation.ts, so the two never drift. Kept in a
 * separate file because validation.ts pulls in the server-side OpenAPI
 * registry, which client components must not import.
 */
export const ADVISOR_NAME_MAX = 100
export const ADVISOR_DESCRIPTION_MAX = 2000
export const CONVERSATION_TITLE_MAX = 200
export const QUESTION_MAX = 8000
