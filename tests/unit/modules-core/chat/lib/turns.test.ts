/**
 * Tests for modules-core/chat/lib/turns.ts — auto-titling rules, regenerate
 * planning, and the DB-row → message mapper shared by the reply routes.
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TITLE,
  HISTORY_WINDOW,
  REPLY_RATE_LIMIT_KEY,
  REPLY_RATE_LIMIT_PER_MIN,
  deriveTitle,
  isFirstExchange,
  planRegenerate,
  shouldAutoTitle,
  toChatMessage,
} from '@/modules-core/chat/lib/turns'

describe('constants', () => {
  it('shares one rate-limit bucket per user across reply routes', () => {
    expect(REPLY_RATE_LIMIT_KEY('u1')).toBe('chat-send:u1')
    expect(REPLY_RATE_LIMIT_PER_MIN).toBeGreaterThan(0)
    expect(HISTORY_WINDOW).toBeGreaterThan(0)
  })
})

describe('deriveTitle', () => {
  it('collapses whitespace and strips characters the rename route rejects', () => {
    expect(deriveTitle('  Hello\n\n<world>\t!  ')).toBe('Hello world !')
  })

  it('caps the title at 60 characters', () => {
    expect(deriveTitle('x'.repeat(100))).toHaveLength(60)
  })

  it('falls back to the default title when nothing usable is left', () => {
    expect(deriveTitle('<>\n\x00')).toBe(DEFAULT_TITLE)
  })
})

describe('shouldAutoTitle', () => {
  it('names a chat that still has the default title', () => {
    expect(shouldAutoTitle(DEFAULT_TITLE)).toBe(true)
  })

  it('keeps a title the user chose', () => {
    expect(shouldAutoTitle('My trip')).toBe(false)
    expect(shouldAutoTitle('My trip', 'plan a trip to Lisbon')).toBe(false)
  })

  it('re-titles when the title was derived from the message being replaced', () => {
    expect(shouldAutoTitle(deriveTitle('plan a trip to Lisbon'), 'plan a trip to Lisbon')).toBe(true)
  })
})

describe('isFirstExchange', () => {
  it('is true while only user turns exist', () => {
    expect(isFirstExchange([])).toBe(true)
    expect(isFirstExchange([{ role: 'user' }, { role: 'user' }])).toBe(true)
  })

  it('is false once any other turn exists', () => {
    expect(isFirstExchange([{ role: 'user' }, { role: 'assistant' }])).toBe(false)
  })
})

describe('planRegenerate', () => {
  const rows = [
    { id: 'u1', role: 'user' },
    { id: 'a1', role: 'assistant' },
    { id: 'u2', role: 'user' },
    { id: 'a2', role: 'assistant' },
  ]

  it('replaces the reply after the last user turn', () => {
    expect(planRegenerate(rows)).toEqual({
      deleteIds: ['a2'],
      history: rows.slice(0, 3),
      userTurn: rows[2],
    })
  })

  it('answers an unanswered last user turn without deleting anything', () => {
    const plan = planRegenerate(rows.slice(0, 3))
    expect(plan?.deleteIds).toEqual([])
    expect(plan?.userTurn.id).toBe('u2')
  })

  it('replaces every trailing non-user row', () => {
    const plan = planRegenerate([...rows, { id: 's1', role: 'system' }])
    expect(plan?.deleteIds).toEqual(['a2', 's1'])
  })

  it('returns null when there is no user turn', () => {
    expect(planRegenerate([])).toBeNull()
    expect(planRegenerate([{ id: 'a', role: 'assistant' }])).toBeNull()
  })
})

describe('toChatMessage', () => {
  const row = {
    id: 'm1',
    conversationId: 'c1',
    userId: 'u1',
    role: 'user',
    content: 'hi',
    attachments: [{ upload_id: 'x' }],
    createdAt: '2026-09-30T10:00:00Z',
  }

  it('maps camelCase columns to the API shape', () => {
    expect(toChatMessage(row)).toEqual({
      id: 'm1',
      conversation_id: 'c1',
      user_id: 'u1',
      role: 'user',
      content: 'hi',
      attachments: [{ upload_id: 'x' }],
      created_at: '2026-09-30T10:00:00Z',
    })
  })

  it('treats null attachments as none', () => {
    expect(toChatMessage({ ...row, attachments: null }).attachments).toEqual([])
  })
})
