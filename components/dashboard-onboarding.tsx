'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import 'driver.js/dist/driver.css'

const DISMISS_KEY = 'ari:dashboard:welcomeDismissed'

/**
 * Welcome popup + guided tour for the dashboard. Mounted once in the (app)
 * layout and self-gates to /dashboard, so nothing in modules-core/dashboard
 * needs to change. Mirrors the /modules welcome dialog pattern: shows on
 * every dashboard visit until the user dismisses it (or takes the tour).
 *
 * The tour (driver.js) anchors to core shell elements via data-tour
 * attributes; steps whose target isn't in the DOM (e.g. mobile, where the
 * sidebar lives in a closed sheet) are skipped automatically.
 */
export function DashboardOnboarding() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (pathname !== '/dashboard') return
    try {
      if (!localStorage.getItem(DISMISS_KEY)) setOpen(true)
    } catch {
      /* localStorage disabled — default to showing it */
      setOpen(true)
    }
  }, [pathname])

  const dismissForever = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore storage errors */
    }
    setOpen(false)
  }

  const startTour = async () => {
    // Taking the tour counts as completing onboarding — don't re-show the popup.
    dismissForever()
    const { driver } = await import('driver.js')

    const isMac =
      typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '')
    const modKey = isMac ? '⌘' : 'Ctrl+'

    const candidates = [
      {
        element: '[data-tour="main-content"]',
        popover: {
          title: 'Your dashboard',
          description:
            'This is your home base — widgets from your modules give you an at-a-glance view of tasks, fitness, goals, and more. Head to Settings to choose a layout and which widgets appear.',
        },
      },
      {
        element: '[data-sidebar="sidebar"]',
        popover: {
          title: 'Everything is a module',
          description:
            'Every feature in ARI is a module, and they all live here in the sidebar. Press ' +
            modKey +
            'D to drag groups into your preferred order.',
        },
      },
      {
        element: '[data-tour="quick-icons"]',
        popover: {
          title: 'Quick actions',
          description:
            'One-click access to your most-used tools — plus themes, settings, and sign out. Modules can add their own icons here too.',
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
            'Discover, install, and manage modules that extend ARI — or build your very own. This is where ARI grows with you.',
        },
      },
      {
        popover: {
          title: "You're all set",
          description:
            'That’s the lay of the land. Make ARI yours — install modules, pick a theme, and arrange the dashboard the way you like it.',
        },
      },
    ]

    // Keep element-anchored steps only when the target is actually rendered;
    // element-less steps show as a centered popover.
    const steps = candidates.filter((s) => !s.element || document.querySelector(s.element))

    driver({
      showProgress: true,
      popoverClass: 'ari-tour',
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 8,
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Done',
      progressText: '{{current}} of {{total}}',
      steps,
    }).drive()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
      <DialogContent className="sm:max-w-[36.4rem]">
        <div className="-mx-6 -mt-6 mb-2 overflow-hidden rounded-t-lg bg-[#212121]">
          <img
            src="/ari-dashboard-terminal.svg"
            alt="Terminal showing the ari tour command"
            className="block h-auto w-full"
          />
        </div>
        <DialogHeader>
          <DialogTitle className="text-xl">Welcome to ARI</DialogTitle>
          <DialogDescription className="pt-2 text-base">
            This dashboard is your home base — every widget on it comes from a module, and
            everything can be rearranged, themed, and extended. Take a 60-second tour to see how it
            all fits together.
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
          onClick={dismissForever}
          className="mx-auto -mb-2 mt-1 block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Don&apos;t show this again
        </button>
      </DialogContent>
    </Dialog>
  )
}
