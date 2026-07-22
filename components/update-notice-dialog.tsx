"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { ArrowRight, ExternalLink, Rocket } from "lucide-react"

import { useVersionCheck } from "@/hooks/use-version-check"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const UPDATE_DOCS_URL = "https://ari.software/docs/updating"

// Session-local dismissal. The server's 4-day stamp was already written when
// the check ran, so a dismissal needs no API call — this flag only stops the
// TanStack-cached result from reopening the popup on soft navigation. It
// resets on hard reload, where the server gate answers false for 4 days.
let dismissedThisSession = false

/**
 * "New version is available" popup, shown on /dashboard when the server-side
 * check (at most one upstream call per user per 4 days) reports an update.
 */
export function UpdateNoticeDialog() {
  const pathname = usePathname()
  const { data } = useVersionCheck(pathname === "/dashboard")
  const [dismissed, setDismissed] = React.useState(() => dismissedThisSession)

  const open =
    pathname === "/dashboard" &&
    !!data?.updateAvailable &&
    !!data.latestVersion &&
    !dismissed

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      dismissedThisSession = true
      setDismissed(true)
    }
  }

  if (!data?.latestVersion) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <div className="bg-gradient-to-b from-accent/10 to-transparent px-6 pb-5 pt-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/25">
              <Rocket className="h-5 w-5" />
            </div>
            <DialogHeader className="space-y-1.5">
              <DialogTitle className="text-base font-semibold">
                New version is available
              </DialogTitle>
              <DialogDescription>
                A newer release of ARI is ready. Update to get the latest
                features, improvements, and fixes.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="px-6">
          <div className="flex items-center justify-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Installed
              </span>
              <span className="font-mono text-sm text-muted-foreground">
                v{data.currentVersion}
              </span>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground/60" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-accent">
                Latest
              </span>
              <span className="font-mono text-sm font-semibold text-foreground">
                v{data.latestVersion}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 pb-6 pt-5">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Ignore
          </Button>
          <Button asChild>
            <a href={UPDATE_DOCS_URL} target="_blank" rel="noopener noreferrer">
              Learn More
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
