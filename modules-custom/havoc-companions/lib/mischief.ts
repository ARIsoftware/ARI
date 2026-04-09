/**
 * Havoc Companions Module — Mischief engine
 *
 * Periodically grabs a random visible DOM element and applies a small
 * accumulative CSS transform (and optional blur, for text) to it. Effects
 * are tracked per-element so multiple bumps stack into ever-increasing
 * chaos.
 *
 * Transforms + filters are applied via CSS custom properties + a global
 * stylesheet rule keyed on `data-havoc-mischief`. This is critical because:
 *   - React doesn't manage `--ari-havoc-mischief-*` so re-renders won't wipe
 *     them.
 *   - The `!important` in the stylesheet rule wins over any Tailwind/shadcn
 *     `transform`/`filter` class on the element.
 *
 * Not persisted: a page reload resets the DOM and therefore resets all
 * mischief.
 */

const SELECTOR = [
  'button',
  'a[href]',
  'h1',
  'h2',
  'h3',
  'p',
  'img',
  'svg',
  'input',
  'label',
  '[role="button"]',
  '.card',
  'li',
]
  .map(s => `${s}:not([data-havoc-canvas]):not([data-havoc-shield])`)
  .join(',')

/** Tags that look like "text" — only these get the blur axis. */
const TEXT_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LABEL', 'LI', 'SPAN', 'A'])

const MISCHIEF_VAR_TRANSFORM = '--ari-havoc-mischief-transform'
const MISCHIEF_VAR_FILTER = '--ari-havoc-mischief-filter'
const MISCHIEF_ATTR = 'data-havoc-mischief'
const MISCHIEF_STYLE_ID = 'ari-havoc-mischief-style'

const MAX_BLUR_PX = 3.5
const MIN_SCALE = 0.8
const MAX_SCALE = 1.2
/** Cap the victim-scan so huge pages don't thrash layout on every burst. */
const MAX_SCAN = 64

interface Effect {
  rotate: number
  skewX: number
  skewY: number
  translateX: number
  translateY: number
  scale: number
  blur: number
}

const elementEffects = new WeakMap<HTMLElement, Effect>()

function newEffect(): Effect {
  return {
    rotate: 0,
    skewX: 0,
    skewY: 0,
    translateX: 0,
    translateY: 0,
    scale: 1,
    blur: 0,
  }
}

function effectToTransform(eff: Effect): string {
  return (
    `translate(${eff.translateX.toFixed(2)}px, ${eff.translateY.toFixed(2)}px) ` +
    `rotate(${eff.rotate.toFixed(2)}deg) ` +
    `skew(${eff.skewX.toFixed(2)}deg, ${eff.skewY.toFixed(2)}deg) ` +
    `scale(${eff.scale.toFixed(3)})`
  )
}

function effectToFilter(eff: Effect): string {
  return eff.blur > 0.05 ? `blur(${eff.blur.toFixed(2)}px)` : 'none'
}

function applyEffect(el: HTMLElement, eff: Effect) {
  el.style.setProperty(MISCHIEF_VAR_TRANSFORM, effectToTransform(eff))
  el.style.setProperty(MISCHIEF_VAR_FILTER, effectToFilter(eff))
  if (!el.hasAttribute(MISCHIEF_ATTR)) {
    el.setAttribute(MISCHIEF_ATTR, '1')
  }
}

/**
 * Inject the global stylesheet that consumes the mischief CSS variables.
 * Idempotent — call on every provider mount; the existing tag is reused.
 * Returns a teardown function that removes the tag.
 */
export function installMischiefStylesheet(): () => void {
  if (typeof document === 'undefined') return () => {}
  let styleEl = document.getElementById(MISCHIEF_STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = MISCHIEF_STYLE_ID
    styleEl.textContent =
      `[${MISCHIEF_ATTR}] {` +
      `transform: var(${MISCHIEF_VAR_TRANSFORM}) !important;` +
      `filter: var(${MISCHIEF_VAR_FILTER}) !important;` +
      `transition: transform 600ms ease-out, filter 600ms ease-out !important;` +
      `}`
    document.head.appendChild(styleEl)
  }
  return () => {
    document.getElementById(MISCHIEF_STYLE_ID)?.remove()
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width < 16 || rect.height < 16) return false
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false
  if (rect.right < 0 || rect.left > window.innerWidth) return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false
  }
  return true
}

/**
 * Collect up to `count` distinct visible victims from a single DOM scan.
 *
 * Does ONE `querySelectorAll` for the whole burst, then picks random
 * starting offsets and walks forward until the scan budget is exhausted.
 * This avoids the O(DOM × bumpCount) layout thrash of calling `pickVictim`
 * multiple times per burst on content-heavy pages.
 */
function collectVictims(count: number): HTMLElement[] {
  const all = document.querySelectorAll<HTMLElement>(SELECTOR)
  const n = all.length
  if (n === 0) return []

  const chosen: HTMLElement[] = []
  const seen = new Set<HTMLElement>()
  // Scan budget bounds the worst-case `getComputedStyle` count for a burst.
  const budget = Math.min(MAX_SCAN, n)

  for (let c = 0; c < count; c++) {
    const start = Math.floor(Math.random() * n)
    let scanned = 0
    for (let i = 0; i < n && scanned < budget; i++) {
      const el = all[(start + i) % n]
      if (seen.has(el)) continue
      scanned++
      if (isVisible(el)) {
        chosen.push(el)
        seen.add(el)
        break
      }
    }
  }
  return chosen
}

type Axis = 'rotate' | 'skewX' | 'skewY' | 'translate' | 'scale' | 'blur'

const NON_TEXT_AXES: Axis[] = ['rotate', 'skewX', 'skewY', 'translate', 'scale']
const TEXT_AXES: Axis[] = [...NON_TEXT_AXES, 'blur']

function bumpOne(victim: HTMLElement, intensity: number) {
  // 1 -> 1.6, 5 -> 4.0, 10 -> 7.0
  const magnitude = 1.0 + intensity * 0.6

  let eff = elementEffects.get(victim)
  if (!eff) {
    eff = newEffect()
    elementEffects.set(victim, eff)
  }

  const isTextLike = TEXT_TAGS.has(victim.tagName)
  const axes = isTextLike ? TEXT_AXES : NON_TEXT_AXES

  // Pick 1-2 random axes per bump so chaos spreads across multiple
  // dimensions instead of all stacking on rotation.
  const pickCount = Math.random() < 0.5 ? 1 : 2
  for (let i = 0; i < pickCount; i++) {
    const axis = axes[Math.floor(Math.random() * axes.length)]
    switch (axis) {
      case 'rotate':
        eff.rotate += rand(-magnitude, magnitude) * 1.5
        break
      case 'skewX':
        eff.skewX += rand(-magnitude, magnitude)
        break
      case 'skewY':
        eff.skewY += rand(-magnitude, magnitude) * 0.7
        break
      case 'translate':
        eff.translateX += rand(-magnitude, magnitude) * 2.5
        eff.translateY += rand(-magnitude, magnitude) * 2.5
        break
      case 'scale':
        eff.scale *= 1 + rand(-magnitude, magnitude) * 0.018
        break
      case 'blur':
        // Blur only ever increases (you can't unblur once blurred), so
        // it accumulates much more slowly than the symmetric axes.
        eff.blur += rand(0, magnitude * 0.4)
        break
    }
  }

  if (eff.scale < MIN_SCALE) eff.scale = MIN_SCALE
  if (eff.scale > MAX_SCALE) eff.scale = MAX_SCALE
  if (eff.blur > MAX_BLUR_PX) eff.blur = MAX_BLUR_PX

  applyEffect(victim, eff)
}

/**
 * Apply a burst of mischief bumps. The number of bumps scales with
 * intensity so cranking the slider up makes the chaos arrive faster
 * across MORE elements per cycle, not just bigger nudges.
 *
 *   intensity 1-4   → 1 victim per burst
 *   intensity 5-7   → 2 victims per burst
 *   intensity 8-10  → 3 victims per burst
 */
export function applyMischiefBurst(intensity: number): number {
  const count = Math.max(1, Math.round(intensity / 3))
  const victims = collectVictims(count)
  for (const v of victims) bumpOne(v, intensity)
  return victims.length
}

/**
 * Convert intensity (1..10) to a delay between bursts in ms.
 * 1 -> ~30s, 10 -> ~1.5s, smooth exponential curve in between.
 */
export function intensityToDelayMs(intensity: number): number {
  const clamped = Math.max(1, Math.min(10, intensity))
  const t = (clamped - 1) / 9 // 0..1
  return Math.round(30000 * Math.pow(1500 / 30000, t))
}

/** Friendly label for a given intensity slider position. */
export function intensityLabel(intensity: number): string {
  if (intensity <= 1) return 'Barely a whisper'
  if (intensity <= 3) return 'Mild mischief'
  if (intensity <= 5) return 'Cheeky'
  if (intensity <= 7) return 'Definitely up to something'
  if (intensity <= 9) return 'Out of pocket'
  return 'Pure chaos'
}

/** Friendly label for a given speed slider position. */
export function speedLabel(speed: number): string {
  if (speed <= 1) return 'Sloth mode'
  if (speed <= 3) return 'Strolling'
  if (speed <= 5) return 'Steady pace'
  if (speed <= 7) return 'Brisk trot'
  if (speed <= 9) return 'Sprinting'
  return 'Zoomies!'
}
