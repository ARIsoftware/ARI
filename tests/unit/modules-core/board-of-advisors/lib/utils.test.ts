import { describe, it, expect } from 'vitest'
import {
  pickAdvisorColor,
  advisorInitials,
  errorDescription,
  destructiveToast,
} from '@/modules-core/board-of-advisors/lib/utils'

// ---------------------------------------------------------------------------
// pickAdvisorColor
// ---------------------------------------------------------------------------
describe('pickAdvisorColor', () => {
  it('returns a string starting with #', () => {
    expect(pickAdvisorColor(0)).toMatch(/^#/)
    expect(pickAdvisorColor(5)).toMatch(/^#/)
  })

  it('wraps around when existingCount exceeds palette length (12 colors)', () => {
    expect(pickAdvisorColor(0)).toBe(pickAdvisorColor(12))
    expect(pickAdvisorColor(1)).toBe(pickAdvisorColor(13))
    expect(pickAdvisorColor(11)).toBe(pickAdvisorColor(23))
  })

  it('returns different colors for different indices within the palette', () => {
    expect(pickAdvisorColor(0)).not.toBe(pickAdvisorColor(1))
  })

  it('handles large existingCount values gracefully', () => {
    expect(() => pickAdvisorColor(1000)).not.toThrow()
    expect(pickAdvisorColor(1000)).toMatch(/^#/)
  })
})

// ---------------------------------------------------------------------------
// advisorInitials
// ---------------------------------------------------------------------------
describe('advisorInitials', () => {
  it('returns first + last initials for a two-word name (Steve Jobs → SJ)', () => {
    expect(advisorInitials('Steve Jobs')).toBe('SJ')
  })

  it('returns first + last initials for a three-word name (Mary Jo Benson → MB)', () => {
    expect(advisorInitials('Mary Jo Benson')).toBe('MB')
  })

  it('returns first two chars uppercase for a single word (Oprah → OP)', () => {
    expect(advisorInitials('Oprah')).toBe('OP')
  })

  it('returns first two chars for a two-char single word', () => {
    expect(advisorInitials('Jo')).toBe('JO')
  })

  it('returns first char only for a single-char name', () => {
    expect(advisorInitials('A')).toBe('A')
  })

  it('returns "?" for an empty string', () => {
    expect(advisorInitials('')).toBe('?')
  })

  it('returns "?" for whitespace-only string', () => {
    expect(advisorInitials('   ')).toBe('?')
  })

  it('trims extra whitespace', () => {
    expect(advisorInitials('  Steve  Jobs  ')).toBe('SJ')
  })
})

// ---------------------------------------------------------------------------
// errorDescription
// ---------------------------------------------------------------------------
describe('errorDescription', () => {
  it('returns the error message for an Error instance', () => {
    expect(errorDescription(new Error('Something broke'))).toBe('Something broke')
  })

  it('returns "Please try again." for non-Error values', () => {
    expect(errorDescription('string error')).toBe('Please try again.')
    expect(errorDescription(null)).toBe('Please try again.')
    expect(errorDescription(undefined)).toBe('Please try again.')
    expect(errorDescription(42)).toBe('Please try again.')
    expect(errorDescription({})).toBe('Please try again.')
  })

  it('returns "Please try again." for an Error with empty message', () => {
    expect(errorDescription(new Error(''))).toBe('Please try again.')
  })
})

// ---------------------------------------------------------------------------
// destructiveToast
// ---------------------------------------------------------------------------
describe('destructiveToast', () => {
  it('returns an object with variant "destructive"', () => {
    const result = destructiveToast('Upload failed', new Error('network'))
    expect(result.variant).toBe('destructive')
  })

  it('uses the provided title', () => {
    const result = destructiveToast('Something went wrong', new Error('oops'))
    expect(result.title).toBe('Something went wrong')
  })

  it('uses the Error message as description', () => {
    const result = destructiveToast('Oops', new Error('disk full'))
    expect(result.description).toBe('disk full')
  })

  it('falls back to "Please try again." for non-Error', () => {
    const result = destructiveToast('Oops', null)
    expect(result.description).toBe('Please try again.')
  })
})
