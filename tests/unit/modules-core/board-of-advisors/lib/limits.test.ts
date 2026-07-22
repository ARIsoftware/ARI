import { describe, it, expect } from 'vitest'
import {
  ADVISOR_NAME_MAX,
  ADVISOR_DESCRIPTION_MAX,
  CONVERSATION_TITLE_MAX,
  QUESTION_MAX,
} from '@/modules-core/board-of-advisors/lib/limits'

describe('board-of-advisors limits', () => {
  it('ADVISOR_NAME_MAX is 100', () => {
    expect(ADVISOR_NAME_MAX).toBe(100)
  })

  it('ADVISOR_DESCRIPTION_MAX is 2000', () => {
    expect(ADVISOR_DESCRIPTION_MAX).toBe(2000)
  })

  it('CONVERSATION_TITLE_MAX is 200', () => {
    expect(CONVERSATION_TITLE_MAX).toBe(200)
  })

  it('QUESTION_MAX is 8000', () => {
    expect(QUESTION_MAX).toBe(8000)
  })

  it('all limits are positive numbers', () => {
    expect(ADVISOR_NAME_MAX).toBeGreaterThan(0)
    expect(ADVISOR_DESCRIPTION_MAX).toBeGreaterThan(0)
    expect(CONVERSATION_TITLE_MAX).toBeGreaterThan(0)
    expect(QUESTION_MAX).toBeGreaterThan(0)
  })
})
