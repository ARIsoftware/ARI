'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Space_Grotesk } from 'next/font/google'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUserPreferences, useUpdateUserPreferences } from '@/hooks/use-user-preferences'
import 'driver.js/dist/driver.css'

// Pre-DB installs stored the dismissal in localStorage; honored once and
// written through to user_preferences so other browsers stay quiet too.
const LEGACY_DISMISS_KEY = 'ari:dashboard:welcomeDismissed'

// preload: false — this font paints only the "ARI" wordmark inside a dialog
// most users see once, so it isn't worth a render-blocking preload on every
// authenticated page; it loads on demand when the dialog first renders.
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: '500', preload: false })

/**
 * Welcome popup + guided tour for the dashboard. Mounted once in the (app)
 * layout and self-gates to /dashboard, so nothing in modules-core/dashboard
 * needs to change.
 *
 * Dismissal is per-user in user_preferences.welcome_dismissed (so it follows
 * the account across browsers) and is set only when the user clicks "Don't
 * show this again" or finishes the tour on its final step. Closing the popup
 * or abandoning the tour midway leaves it unset, so the popup returns on the
 * next dashboard visit — same behavior as the /modules welcome dialog.
 *
 * The tour (driver.js) anchors to core shell elements via data-tour
 * attributes; steps whose target isn't in the DOM (e.g. mobile, where the
 * sidebar lives in a closed sheet) are skipped automatically.
 */
export function DashboardOnboarding() {
  const pathname = usePathname()
  const onDashboard = pathname === '/dashboard'
  const { data: prefs } = useUserPreferences({ enabled: onDashboard })
  const { mutate: savePrefs } = useUpdateUserPreferences()

  // Legacy flag, read once per app load (lazy initializer, so SSR's missing
  // localStorage safely falls back to false). It only ever changes via our
  // own write-through below, so no live subscription is needed.
  const [legacyDismissed] = useState(() => {
    try {
      return !!localStorage.getItem(LEGACY_DISMISS_KEY)
    } catch {
      /* SSR or localStorage disabled — fall through to showing the popup */
      return false
    }
  })

  // Closing the popup (or starting the tour) hides it for the current
  // dashboard visit only; cleared during render when the user navigates away
  // (the "adjust state when props change" pattern) so the popup returns on
  // the next visit until actually dismissed.
  const [closed, setClosed] = useState(false)
  if (closed && !onDashboard) setClosed(false)

  const open = onDashboard && !!prefs && !prefs.welcome_dismissed && !legacyDismissed && !closed

  const markDismissed = () => {
    setClosed(true)
    savePrefs({ welcome_dismissed: true })
  }

  // Write the legacy localStorage dismissal through to user_preferences so
  // other browsers stay quiet too — pure external-system sync; the popup is
  // already suppressed via `legacyDismissed` above.
  const syncedLegacy = useRef(false)
  useEffect(() => {
    if (!onDashboard || !prefs || prefs.welcome_dismissed) return
    if (!legacyDismissed || syncedLegacy.current) return
    syncedLegacy.current = true
    savePrefs(
      { welcome_dismissed: true },
      {
        // Drop the legacy key once the server owns the flag, so this
        // write-through path retires itself; on failure the key stays and
        // the next full page load retries.
        onSuccess: () => {
          try {
            localStorage.removeItem(LEGACY_DISMISS_KEY)
          } catch {
            /* localStorage disabled — key already unreadable anyway */
          }
        },
      },
    )
  }, [onDashboard, prefs, legacyDismissed, savePrefs])

  const startTour = async () => {
    setClosed(true)
    const { driver } = await import('driver.js')

    const isMac =
      typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '')
    const modKey = isMac ? '⌘' : 'Ctrl+'

    const candidates = [
      {
        // Element-less: centered popover over the full overlay. The extra
        // class pins it ~90px from the viewport top (see globals.css).
        popover: {
          popoverClass: 'ari-tour ari-tour-intro',
          title: 'Your Dashboard',
          description:
            'This is your customizable dashboard, where you can see the information that matters most to you.',
        },
      },
      {
        element: '[data-sidebar="sidebar"]',
        popover: {
          // Vertically centered against the full-height sidebar so the popover
          // sits mid-viewport at any window size (driver.js still clamps it
          // on-screen), instead of hugging the viewport top.
          side: 'right' as const,
          align: 'center' as const,
          title: 'Everything is a module',
          description:
            "Every feature in ARI is a module, and they all live here in the sidebar. ARI's AI integration lets you customize any module or build your own modules in minutes.",
        },
      },
      {
        element: '[data-tour="quick-icons"]',
        popover: {
          side: 'bottom' as const,
          align: 'start' as const,
          title: 'Quick actions',
          description:
            'One-click access to your most-used tools - plus themes, settings, and sign out. Modules can add their own icons here too.',
        },
      },
      {
        element: '[data-tour="command-icon"]',
        popover: {
          title: 'Command palette',
          description:
            'Jump anywhere without touching the mouse. Press ' +
            modKey +
            'K from any page to search modules and actions.',
        },
      },
      {
        element: '[data-tour="modules-icon"]',
        popover: {
          title: 'The Module Library',
          description:
            'Discover, install, and manage modules that extend ARI - or build your very own. This is where ARI grows with you.',
        },
      },
      {
        element: '[data-tour="settings-icon"]',
        popover: {
          title: 'Settings',
          description:
            'Configure ARI here - your profile, themes, AI providers, API access, account security, and more.',
        },
      },
      {
        popover: {
          title: "You're all set",
          // driver.js renders description as HTML, so the docs link works here;
          // link styling lives under .ari-tour in globals.css.
          description:
            'That’s the lay of the land. Make ARI yours - install modules, pick a theme, and arrange the dashboard the way you like it. Want to go deeper? <a href="https://ari.software/docs" target="_blank" rel="noopener noreferrer">Read the ARI docs</a> to learn how to use and manage ARI - and even create your own modules.',
        },
      },
    ]

    // Keep element-anchored steps only when the target is actually rendered;
    // element-less steps show as a centered popover.
    const steps = candidates.filter((s) => !s.element || document.querySelector(s.element))

    const driverObj = driver({
      showProgress: true,
      popoverClass: 'ari-tour',
      // No slide/morph between steps: the overlay cutout and popover jump
      // straight to each step's target instead of animating across the screen.
      animate: false,
      overlayOpacity: 0.55,
      // 0 so the cutout hugs each target exactly — any padding leaks an
      // undimmed strip of page background around flush elements like the
      // sidebar (a bright line between sidebar and dimmed content).
      stagePadding: 0,
      stageRadius: 8,
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Done',
      progressText: '{{current}} of {{total}}',
      // Reaching the final step counts as completing onboarding; bailing out
      // earlier (Esc, X, overlay click) leaves the popup armed for next visit.
      // driver.js resets its state BEFORE this hook runs, so driverObj methods
      // like isLastStep() read empty state here — the pre-reset snapshot only
      // arrives via the hook's opts (index = activeIndex at destroy time).
      onDestroyed: (_element, _step, { index }) => {
        if (index === steps.length - 1) markDismissed()
      },
      steps,
    })
    driverObj.drive()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setClosed(true)}>
      {/* bg-black/55 matches the driver.js tour overlay (black at overlayOpacity 0.55) */}
      <DialogContent className="sm:max-w-[36.4rem]" overlayClassName="bg-black/55">
        {/* Brand panel follows the active theme via the primary tokens (same
            pair as the Start button); the body inherits DialogContent's. */}
        <div className="ari-welcome-brand -mx-6 -mt-6 mb-2 flex items-center justify-center rounded-t-lg bg-primary py-16">
          <span
            className={`${spaceGrotesk.className} select-none text-[155px] font-medium leading-none text-primary-foreground`}
            aria-hidden="true"
          >
            ARI
          </span>
        </div>
        <DialogHeader>
          <DialogTitle className="text-xl">Welcome to ARI</DialogTitle>
          <DialogDescription className="space-y-3 pt-2 text-[15px] font-normal leading-6">
            <span className="block">
              ARI is designed for those who want complete command over the software that runs their
              life. ARI can be completely customized to your workflow and grows with you.
            </span>
            <span className="block">
              ARI is where mastery, modularity, and AI work in your favour so you can do your best
              work and live your best life.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-end pt-2">
          <Button onClick={startTour}>
            Start
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
        <button
          type="button"
          onClick={markDismissed}
          className="mx-auto -mb-2 mt-1 block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Don&apos;t show this again
        </button>
      </DialogContent>
    </Dialog>
  )
}
