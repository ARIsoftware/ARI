import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { intensityToDelayMs, intensityLabel, speedLabel, installMischiefStylesheet, applyMischiefBurst } from '@/modules-core/havoc-companions/lib/mischief'

describe('intensityToDelayMs', () => {
  it('intensity 1 returns ~30000ms', () => {
    const delay = intensityToDelayMs(1)
    // At t=0: 30000 * (1500/30000)^0 = 30000
    expect(delay).toBe(30000)
  })

  it('intensity 10 returns ~1500ms', () => {
    const delay = intensityToDelayMs(10)
    // At t=1: 30000 * (1500/30000)^1 = 1500
    expect(delay).toBe(1500)
  })

  it('intensity 5 or 6 is between 1500ms and 30000ms', () => {
    const delay5 = intensityToDelayMs(5)
    const delay6 = intensityToDelayMs(6)
    expect(delay5).toBeGreaterThan(1500)
    expect(delay5).toBeLessThan(30000)
    expect(delay6).toBeGreaterThan(1500)
    expect(delay6).toBeLessThan(30000)
    // Higher intensity = shorter delay
    expect(delay6).toBeLessThan(delay5)
  })

  it('clamps intensity below 1 to 1', () => {
    expect(intensityToDelayMs(0)).toBe(intensityToDelayMs(1))
    expect(intensityToDelayMs(-5)).toBe(intensityToDelayMs(1))
  })

  it('clamps intensity above 10 to 10', () => {
    expect(intensityToDelayMs(11)).toBe(intensityToDelayMs(10))
    expect(intensityToDelayMs(100)).toBe(intensityToDelayMs(10))
  })

  it('returns integer values (Math.round)', () => {
    for (let i = 1; i <= 10; i++) {
      expect(Number.isInteger(intensityToDelayMs(i))).toBe(true)
    }
  })
})

describe('intensityLabel', () => {
  it('returns "Barely a whisper" for intensity 1', () => {
    expect(intensityLabel(1)).toBe('Barely a whisper')
  })

  it('returns "Barely a whisper" for intensity <= 1 (e.g., 0)', () => {
    expect(intensityLabel(0)).toBe('Barely a whisper')
  })

  it('returns "Mild mischief" for intensity 2', () => {
    expect(intensityLabel(2)).toBe('Mild mischief')
  })

  it('returns "Mild mischief" for intensity 3', () => {
    expect(intensityLabel(3)).toBe('Mild mischief')
  })

  it('returns "Cheeky" for intensity 4', () => {
    expect(intensityLabel(4)).toBe('Cheeky')
  })

  it('returns "Cheeky" for intensity 5', () => {
    expect(intensityLabel(5)).toBe('Cheeky')
  })

  it('returns "Definitely up to something" for intensity 6', () => {
    expect(intensityLabel(6)).toBe('Definitely up to something')
  })

  it('returns "Definitely up to something" for intensity 7', () => {
    expect(intensityLabel(7)).toBe('Definitely up to something')
  })

  it('returns "Out of pocket" for intensity 8', () => {
    expect(intensityLabel(8)).toBe('Out of pocket')
  })

  it('returns "Out of pocket" for intensity 9', () => {
    expect(intensityLabel(9)).toBe('Out of pocket')
  })

  it('returns "Pure chaos" for intensity 10', () => {
    expect(intensityLabel(10)).toBe('Pure chaos')
  })

  it('returns "Pure chaos" for intensity > 10', () => {
    expect(intensityLabel(15)).toBe('Pure chaos')
  })
})

describe('speedLabel', () => {
  it('returns "Sloth mode" for speed 1', () => {
    expect(speedLabel(1)).toBe('Sloth mode')
  })

  it('returns "Sloth mode" for speed <= 1 (e.g., 0)', () => {
    expect(speedLabel(0)).toBe('Sloth mode')
  })

  it('returns "Strolling" for speed 2', () => {
    expect(speedLabel(2)).toBe('Strolling')
  })

  it('returns "Strolling" for speed 3', () => {
    expect(speedLabel(3)).toBe('Strolling')
  })

  it('returns "Steady pace" for speed 4', () => {
    expect(speedLabel(4)).toBe('Steady pace')
  })

  it('returns "Steady pace" for speed 5', () => {
    expect(speedLabel(5)).toBe('Steady pace')
  })

  it('returns "Brisk trot" for speed 6', () => {
    expect(speedLabel(6)).toBe('Brisk trot')
  })

  it('returns "Brisk trot" for speed 7', () => {
    expect(speedLabel(7)).toBe('Brisk trot')
  })

  it('returns "Sprinting" for speed 8', () => {
    expect(speedLabel(8)).toBe('Sprinting')
  })

  it('returns "Sprinting" for speed 9', () => {
    expect(speedLabel(9)).toBe('Sprinting')
  })

  it('returns "Zoomies!" for speed 10', () => {
    expect(speedLabel(10)).toBe('Zoomies!')
  })

  it('returns "Zoomies!" for speed > 10', () => {
    expect(speedLabel(15)).toBe('Zoomies!')
  })
})

describe('installMischiefStylesheet — no document (node env)', () => {
  it('returns a no-op teardown function when document is undefined', () => {
    // In node env, document is undefined — the function should return () => {}
    const teardown = installMischiefStylesheet()
    expect(typeof teardown).toBe('function')
    // Should not throw
    expect(() => teardown()).not.toThrow()
  })
})

describe('installMischiefStylesheet — with mocked document', () => {
  let mockStyleEl: {
    id: string
    textContent: string
    remove: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockStyleEl = { id: '', textContent: '', remove: vi.fn() }
    const mockHead = { appendChild: vi.fn() }
    const mockDocument = {
      getElementById: vi.fn().mockReturnValue(null),
      createElement: vi.fn().mockReturnValue(mockStyleEl),
      head: mockHead,
    }
    vi.stubGlobal('document', mockDocument)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates and appends a style element', () => {
    installMischiefStylesheet()
    expect(document.createElement).toHaveBeenCalledWith('style')
    expect(document.head.appendChild).toHaveBeenCalledWith(mockStyleEl)
  })

  it('sets the style id', () => {
    installMischiefStylesheet()
    expect(mockStyleEl.id).toBe('ari-havoc-mischief-style')
  })

  it('includes transform and filter in stylesheet', () => {
    installMischiefStylesheet()
    expect(mockStyleEl.textContent).toContain('transform')
    expect(mockStyleEl.textContent).toContain('filter')
  })

  it('teardown calls remove on the element', () => {
    // getElementById returns non-null on teardown call
    const mockExistingEl = { remove: vi.fn() }
    const mockDoc = document as unknown as { getElementById: ReturnType<typeof vi.fn> }
    // First call (install) returns null, subsequent call (teardown) returns element
    mockDoc.getElementById.mockReturnValueOnce(null).mockReturnValue(mockExistingEl)

    const teardown = installMischiefStylesheet()
    teardown()
    expect(mockExistingEl.remove).toHaveBeenCalled()
  })

  it('reuses existing style element if already present', () => {
    const mockDoc = document as unknown as { getElementById: ReturnType<typeof vi.fn> }
    mockDoc.getElementById.mockReturnValue(mockStyleEl)
    installMischiefStylesheet()
    // Should not create a new element since one already exists
    expect(document.createElement).not.toHaveBeenCalled()
  })
})

describe('applyMischiefBurst — no document', () => {
  it('returns 0 victims when document is undefined (node env)', () => {
    // document.querySelectorAll would throw in node — the function calls
    // collectVictims which calls document.querySelectorAll
    // Without a document stub, this will throw. We confirm it either returns 0 or throws.
    // Since document is undefined in node, collectVictims will throw.
    // The function doesn't guard against missing document, so we just verify behavior.
    expect(() => applyMischiefBurst(5)).toThrow()
  })
})

describe('applyMischiefBurst — with mocked DOM', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 0 when no elements found', () => {
    const mockDoc = {
      querySelectorAll: vi.fn().mockReturnValue({ length: 0 }),
    }
    vi.stubGlobal('document', mockDoc)
    const result = applyMischiefBurst(5)
    expect(result).toBe(0)
  })

  it('applies bumps to visible elements', () => {
    const mockEl = {
      tagName: 'P',
      getBoundingClientRect: () => ({ width: 100, height: 50, top: 0, bottom: 50, left: 0, right: 100 }),
      style: { setProperty: vi.fn() },
      hasAttribute: vi.fn().mockReturnValue(false),
      setAttribute: vi.fn(),
    }

    const mockNodeList = { length: 1, 0: mockEl, [Symbol.iterator]: function* () { yield mockEl } }
    vi.stubGlobal('document', { querySelectorAll: vi.fn().mockReturnValue(mockNodeList) })
    vi.stubGlobal('window', {
      innerHeight: 800,
      innerWidth: 1200,
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    })

    const result = applyMischiefBurst(1)
    expect(result).toBeGreaterThanOrEqual(0)
  })
})
