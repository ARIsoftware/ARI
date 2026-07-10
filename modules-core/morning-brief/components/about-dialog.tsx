'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Sunrise,
  ListChecks,
  CalendarDays,
  CloudSun,
  Volume2,
  Printer,
  Info,
  type LucideIcon,
} from 'lucide-react'

// Shown once automatically (first visit), and re-openable any time via the
// header's info button. The "seen" flag lives in localStorage so it doesn't
// nag on every visit.
const SEEN_KEY = 'morning-brief-about-seen'

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Sunrise,
    title: 'A personal greeting',
    desc: 'A warm good-morning and a short, AI-written motivational note to set the tone.',
  },
  {
    icon: ListChecks,
    title: "Today's top priorities",
    desc: 'Your five highest-priority open tasks, pulled straight from the Tasks module.',
  },
  {
    icon: CalendarDays,
    title: "Today's schedule",
    desc: 'Your meetings — connect Google Calendar, or subscribe to a calendar link (no OAuth needed).',
  },
  {
    icon: CloudSun,
    title: 'Local weather',
    desc: "Today's high and low for where you are, right in the letterhead.",
  },
  {
    icon: Volume2,
    title: 'Read aloud',
    desc: 'Press Listen to hear your brief narrated in a natural ElevenLabs voice.',
  },
  {
    icon: Printer,
    title: 'Print or full screen',
    desc: 'A clean one-pager you can print, or expand full screen for a focused read.',
  },
]

export function MorningBriefAboutDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        setOpen(true)
        localStorage.setItem(SEEN_KEY, '1')
      }
    } catch {
      // localStorage unavailable (private mode etc.) — just skip the auto-open.
    }
  }, [])

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="About Morning Brief"
        className="text-muted-foreground hover:text-foreground"
      >
        <Info className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[34rem]">
          {/* Letterhead-style banner, echoing the brief's own header. */}
          <div className="-mx-6 -mt-6 mb-1 flex items-center gap-3 rounded-t-lg border-b border-border bg-gradient-to-b from-primary/10 to-transparent px-6 py-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15">
              <Sunrise className="h-6 w-6 text-primary" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Morning Brief
              </p>
              <p className="text-sm text-muted-foreground">Your whole day, on one page.</p>
            </div>
          </div>

          <DialogHeader>
            <DialogTitle className="text-xl">What is Morning Brief?</DialogTitle>
            <DialogDescription className="pt-1 text-base">
              A one-page daily brief, written like a personal secretary — a greeting, your
              priorities, your schedule, and the weather, ready for you each morning.
            </DialogDescription>
          </DialogHeader>

          <ul className="mt-2 space-y-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4 w-4 text-foreground/80" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between">
            <Button asChild variant="outline" size="sm">
              <Link href="/morning-brief/settings">Open settings</Link>
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
