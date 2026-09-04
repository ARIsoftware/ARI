'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Resets window scroll to the top on every soft navigation (link clicks,
 * Cmd+K palette, router.push).
 *
 * Why this exists: Next.js only scrolls to top if the new page's first element
 * is outside the viewport when it commits. Pages whose first commit is short
 * (module routes render a null loading.tsx; most pages render a spinner while
 * TanStack Query fetches) shrink the document to ~100svh + topbar, so the
 * browser clamps the window scroll to ~46px — exactly the TaskAnnouncement
 * bar's height. Next then sees the content "already in viewport" and skips its
 * scroll reset, leaving the dark topbar scrolled out of view.
 *
 * Back/forward navigations are skipped so the browser's scroll restoration
 * still works.
 */
export function ScrollToTopOnNavigate() {
  const pathname = usePathname()
  const isPopState = useRef(false)

  useEffect(() => {
    const onPop = () => {
      isPopState.current = true
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!isPopState.current) window.scrollTo(0, 0)
    isPopState.current = false
  }, [pathname])

  return null
}
