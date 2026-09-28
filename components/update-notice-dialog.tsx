"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { ExternalLink } from "lucide-react"

import {
  useIgnoreVersionNotice,
  useVersionCheck,
} from "@/hooks/use-version-check"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const UPDATE_DOCS_URL = "https://ari.software/docs/updating"

/**
 * "New version is available" popup, shown on /dashboard on every visit while
 * the server reports an update, until the user clicks Ignore.
 */
export function UpdateNoticeDialog() {
  const pathname = usePathname()
  const onDashboard = pathname === "/dashboard"
  const { data } = useVersionCheck(onDashboard)
  const ignoreNotice = useIgnoreVersionNotice()
  // Closing without choosing (X, Escape, click outside) hides the popup only
  // for the current visit: leaving /dashboard clears it, so the next visit
  // shows the popup again. Only Ignore silences it for 4 days.
  const [closed, setClosed] = React.useState(false)
  if (!onDashboard && closed) setClosed(false)

  const open =
    onDashboard && !!data?.updateAvailable && !!data.latestVersion && !closed

  const handleOpenChange = (next: boolean) => {
    if (!next) setClosed(true)
  }

  const handleIgnore = () => {
    handleOpenChange(false)
    ignoreNotice.mutate()
  }

  if (!data?.latestVersion) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <div className="bg-gradient-to-b from-accent/10 to-transparent px-6 pb-5 pt-6">
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

        <div className="px-6">
          <div className="flex items-center justify-center gap-3 py-3">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Installed
              </span>
              <span className="font-mono text-sm text-muted-foreground">
                v{data.currentVersion}
              </span>
            </div>
            {/* lucide ArrowRight geometry, stretched to ~3.2x the length */}
            <svg
              viewBox="0 0 77 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-4 w-[51px] text-muted-foreground/60"
            >
              <path d="M5 12h67" />
              <path d="m65 5 7 7-7 7" />
            </svg>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground">
                Latest
              </span>
              <span className="font-mono text-sm font-semibold text-foreground">
                v{data.latestVersion}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 pb-6 pt-5">
          <Button variant="outline" onClick={handleIgnore}>
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
