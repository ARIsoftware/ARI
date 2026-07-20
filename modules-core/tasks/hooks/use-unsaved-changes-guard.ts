'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface UseUnsavedChangesGuardOptions {
  /** Whether the form currently holds unsaved edits. */
  hasUnsavedChanges: boolean
  /**
   * Persist the current changes. Return true on success (the guard then
   * continues to the pending destination) or false to keep the dialog open
   * (e.g. validation/save failed).
   */
  onSave: () => Promise<boolean>
}

/**
 * Blocks navigation away from an editable page while there are unsaved changes,
 * mirroring the Brainstorm board guard:
 *   - warns on tab close / refresh via `beforeunload`
 *   - intercepts in-app <a> / <Link> clicks (capture phase) and shows a dialog
 *   - lets in-page buttons defer their own router.push via `requestNavigation`
 *
 * The returned `pendingHref` drives the <UnsavedChangesDialog open> prop.
 */
export function useUnsavedChangesGuard({ hasUnsavedChanges, onSave }: UseUnsavedChangesGuardOptions) {
  const router = useRouter()
  const dirtyRef = useRef(hasUnsavedChanges)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Keep the ref in sync so the (once-registered) event listeners always read
  // the latest dirty state without re-subscribing.
  useEffect(() => {
    dirtyRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])

  // Warn on tab close / hard refresh.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Intercept in-app link clicks while dirty. Runs in the capture phase and
  // calls preventDefault before Next's <Link> onClick, so the SPA navigation
  // is cancelled and we can show the dialog instead.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dirtyRef.current) return
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('#') || anchor.target === '_blank') return
      e.preventDefault()
      setPendingHref(href)
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [])

  /** For in-page buttons (Back, Cancel) that navigate via router.push. */
  const requestNavigation = useCallback(
    (href: string) => {
      if (dirtyRef.current) {
        setPendingHref(href)
      } else {
        router.push(href)
      }
    },
    [router],
  )

  /** Stay — dismiss the dialog and keep editing. */
  const closeDialog = useCallback(() => {
    if (isSaving) return
    setPendingHref(null)
  }, [isSaving])

  /** Discard — drop local changes and continue to the pending destination. */
  const discardAndLeave = useCallback(() => {
    const href = pendingHref
    dirtyRef.current = false
    setPendingHref(null)
    if (href) router.push(href)
  }, [pendingHref, router])

  /** Save — persist, then continue to the pending destination. */
  const saveAndLeave = useCallback(async () => {
    setIsSaving(true)
    try {
      const ok = await onSave()
      if (!ok) return // keep dialog open; user can retry, stay, or discard
      const href = pendingHref
      dirtyRef.current = false
      setPendingHref(null)
      if (href) router.push(href)
    } finally {
      setIsSaving(false)
    }
  }, [onSave, pendingHref, router])

  return { pendingHref, isSaving, requestNavigation, closeDialog, discardAndLeave, saveAndLeave }
}
