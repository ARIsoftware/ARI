/** Tests for modules-core/chat/lib/welcome.ts — the time-of-day greeting. */
import { describe, it, expect } from 'vitest'
import { greeting } from '@/modules-core/chat/lib/welcome'

const at = (hour: number) => new Date(2026, 8, 30, hour, 0, 0)

describe('greeting', () => {
  it('follows the time of day', () => {
    expect(greeting(at(3))).toBe('Up late')
    expect(greeting(at(9))).toBe('Good morning')
    expect(greeting(at(14))).toBe('Good afternoon')
    expect(greeting(at(20))).toBe('Good evening')
  })

  it('adds a first name when there is one', () => {
    expect(greeting(at(9), '  Sam ')).toBe('Good morning, Sam')
    expect(greeting(at(9), '   ')).toBe('Good morning')
    expect(greeting(at(9), null)).toBe('Good morning')
  })
})
