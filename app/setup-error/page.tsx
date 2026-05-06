"use client"

import { Suspense, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertTriangle,
  RefreshCw,
  Settings,
  ChevronDown,
  ChevronRight,
  Database,
  Terminal,
  Copy,
  Check,
} from "lucide-react"
import { classifyBootstrapError, type SetupErrorAction } from "@/lib/setup-error-dictionary"
import type { BootstrapStatus } from "@/lib/types/bootstrap"

interface BootstrapResponse {
  status: BootstrapStatus | string
  error?: string
  pgCode?: string
}

function SetupErrorContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = searchParams.get("status") ?? undefined
  const error = searchParams.get("error") ?? undefined
  const pgCode = searchParams.get("pgCode") ?? undefined

  const explanation = useMemo(
    () => classifyBootstrapError(status, error, pgCode),
    [status, error, pgCode],
  )

  const [showRaw, setShowRaw] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleRetry = async () => {
    setRetrying(true)
    setRetryError(null)
    try {
      const res = await fetch("/api/auth/bootstrap", { method: "POST" })
      const data = (await res.json()) as BootstrapResponse

      switch (data.status) {
        case "no_users":
        case "installed":
          window.location.href = "/welcome"
          return
        case "created":
        case "already_initialized":
          window.location.href = "/sign-in"
          return
        default: {
          const params = new URLSearchParams()
          params.set("status", String(data.status ?? "error"))
          if (data.error) params.set("error", data.error)
          if (data.pgCode) params.set("pgCode", data.pgCode)
          router.replace(`/setup-error?${params.toString()}`)
          setRetrying(false)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error"
      setRetryError(message)
      setRetrying(false)
    }
  }

  const handleReconfigure = () => {
    window.location.href = "/welcome"
  }

  const handleCopy = async () => {
    if (!error) return
    try {
      await navigator.clipboard.writeText(error)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can fail without user gesture in some environments — ignore.
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="h-[35px] bg-black w-full flex items-center justify-center">
        <span className="text-white font-medium">ARI</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="rounded-full bg-amber-100 p-3">
              <AlertTriangle className="h-7 w-7 text-amber-600" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {explanation.title}
            </h1>
            <p className="text-muted-foreground max-w-md">{explanation.summary}</p>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                What we think went wrong
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DiagnosisText text={explanation.diagnosis} />

              <div className="border-t border-border pt-4 space-y-3">
                <div className="text-sm font-medium text-foreground">What you can do</div>
                <ol className="space-y-3">
                  {explanation.actions.map((action, idx) => (
                    <ActionItem key={idx} index={idx + 1} action={action} />
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>

          {retryError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Retry failed: {retryError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            {explanation.retryable && (
              <Button
                onClick={handleRetry}
                disabled={retrying}
                className="flex-1"
                size="lg"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${retrying ? "animate-spin" : ""}`} />
                {retrying ? "Retrying..." : "Retry installation"}
              </Button>
            )}
            {explanation.reconfigurable && (
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={handleReconfigure}
                disabled={retrying}
              >
                <Settings className="h-4 w-4 mr-2" />
                Reconfigure database
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Changed <code className="font-mono">.env.local</code>? Restart the dev server first — env vars are read at startup.
          </p>

          {error && (
            <Card className="bg-muted/30">
              <button
                onClick={() => setShowRaw(v => !v)}
                className="w-full flex items-center justify-between p-4 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors rounded-lg"
              >
                <span className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  Raw error output
                  {pgCode && (
                    <span className="text-xs font-mono text-muted-foreground">
                      (code {pgCode})
                    </span>
                  )}
                </span>
                {showRaw ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {showRaw && (
                <div className="px-4 pb-4 space-y-2">
                  <pre className="text-xs font-mono bg-zinc-950 text-zinc-100 rounded-md p-4 overflow-x-auto whitespace-pre-wrap">
                    {error}
                  </pre>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Include this output if you report the issue.
                    </p>
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      type="button"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionItem({ index, action }: { index: number; action: SetupErrorAction }) {
  return (
    <li className="flex gap-3 items-start">
      <div className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
        {index}
      </div>
      <div className="text-sm">
        <div className="font-medium">{action.heading}</div>
        <div className="text-muted-foreground">
          <InlineMarkup text={action.body} />
        </div>
      </div>
    </li>
  )
}

function DiagnosisText({ text }: { text: string }) {
  return (
    <div className="text-sm text-foreground leading-relaxed">
      <InlineMarkup text={text} />
    </div>
  )
}

function InlineMarkup({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code
            key={i}
            className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono"
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

export default function SetupErrorPage() {
  return (
    <Suspense fallback={null}>
      <SetupErrorContent />
    </Suspense>
  )
}
