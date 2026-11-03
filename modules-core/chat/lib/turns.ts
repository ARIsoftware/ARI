/**
 * Pure helpers for planning a conversation turn (send / regenerate / edit):
 * auto-titling rules and which rows a regenerate replaces. Kept free of DB and
 * request code so the routes stay thin and this logic is unit-tested.
 */

import type { ChatAttachment, ChatMessage } from '@/modules/chat/types'

// Streamed LLM calls are expensive — cap replies (send, regenerate, edit)
// per user per minute. One shared bucket so no route is a way around it.
export const REPLY_RATE_LIMIT_PER_MIN = 20
export const REPLY_RATE_LIMIT_KEY = (userId: string) => `chat-send:${userId}`

// Trailing window of messages sent to the provider. Older turns stay in the
// DB and UI but are not re-sent, keeping token cost and latency bounded.
export const HISTORY_WINDOW = 50

/** Title a conversation carries until its first exchange names it. */
export const DEFAULT_TITLE = 'New chat'

/**
 * Derive a rename-safe title from a user message: strip the characters that
 * safeText() (used by the rename route) rejects so the auto-title can always
 * be edited later, and collapse whitespace/newlines.
 */
export function deriveTitle(content: string): string {
  return content.replace(/[<>\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || DEFAULT_TITLE
}

/**
 * Whether the first exchange may (re)write the title. Only a title the user
 * never chose is replaced: the default, or one auto-derived from the
 * message being replaced (an edited first message). A manual rename sticks.
 */
export function shouldAutoTitle(currentTitle: string, replacedContent?: string): boolean {
  if (currentTitle === DEFAULT_TITLE) return true
  return replacedContent !== undefined && currentTitle === deriveTitle(replacedContent)
}

/** True when no assistant/system turn precedes the reply being generated. */
export function isFirstExchange(history: { role: string }[]): boolean {
  return history.every((m) => m.role === 'user')
}

export interface RegeneratePlan<T> {
  /** Trailing non-user rows the new reply replaces. */
  deleteIds: string[]
  /** Chronological history ending at the user turn being answered. */
  history: T[]
  /** The user turn being answered. */
  userTurn: T
}

/**
 * Plan a regenerate over a chronological window: drop every row after the
 * last user turn (normally the one assistant reply) and answer that turn
 * again. Returns null when the window has no user turn to answer.
 */
export function planRegenerate<T extends { id: string; role: string }>(rows: T[]): RegeneratePlan<T> | null {
  let lastUser = -1
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].role === 'user') {
      lastUser = i
      break
    }
  }
  if (lastUser === -1) return null
  return {
    deleteIds: rows.slice(lastUser + 1).map((r) => r.id),
    history: rows.slice(0, lastUser + 1),
    userTurn: rows[lastUser],
  }
}

/** A chat_messages row as Drizzle returns it (camelCase). */
export interface MessageRow {
  id: string
  conversationId: string
  userId: string
  role: string
  content: string
  attachments: unknown
  createdAt: string
}

/** Map a DB row to the API/provider message shape. */
export function toChatMessage(m: MessageRow): ChatMessage {
  return {
    id: m.id,
    conversation_id: m.conversationId,
    user_id: m.userId,
    role: m.role as ChatMessage['role'],
    content: m.content,
    attachments: (m.attachments as ChatAttachment[] | null) ?? [],
    created_at: m.createdAt,
  }
}
