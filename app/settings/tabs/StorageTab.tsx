"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HardDrive, FileCode, Info } from "lucide-react"
import { PROVIDER_LABELS } from "@/lib/storage/config"

const ENV_VARS: Record<string, string> = {
  filesystem: `ARI_STORAGE_PROVIDER=filesystem`,
  s3: `ARI_STORAGE_PROVIDER=s3
ARI_S3_ACCESS_KEY_ID=
ARI_S3_SECRET_ACCESS_KEY=
ARI_S3_BUCKET=
ARI_S3_REGION=
ARI_S3_ENDPOINT=`,
  r2: `ARI_STORAGE_PROVIDER=r2
ARI_R2_ACCOUNT_ID=
ARI_R2_ACCESS_KEY_ID=
ARI_R2_SECRET_ACCESS_KEY=
ARI_R2_BUCKET=`,
  "supabase-s3": `ARI_STORAGE_PROVIDER=supabase-s3
ARI_SUPABASE_S3_ENDPOINT=
ARI_SUPABASE_S3_ACCESS_KEY_ID=
ARI_SUPABASE_S3_SECRET_ACCESS_KEY=
ARI_SUPABASE_S3_BUCKET=
ARI_SUPABASE_S3_REGION=`,
}

interface StorageStatus {
  provider: string
  providerLabel: string
  source: "env" | "default"
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; data: StorageStatus }

export function StorageTab(): React.ReactElement {
  const [state, setState] = useState<LoadState>({ kind: "loading" })

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/settings/storage", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: StorageStatus | null) => {
        if (data) setState({ kind: "ready", data })
        else setState({ kind: "error" })
      })
      .catch(() => setState({ kind: "error" }))
    return () => controller.abort()
  }, [])

  const activeProvider = state.kind === "ready" ? state.data.provider : "filesystem"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <HardDrive className="h-5 w-5 text-emerald-500" />
              File Storage
            </CardTitle>
            {state.kind === "ready" && (
              <Badge variant="secondary">
                {PROVIDER_LABELS[state.data.provider] ?? state.data.provider}
              </Badge>
            )}
          </div>
          <CardDescription>
            Where uploaded files (photos, documents, etc.) are stored. Configured via environment
            variables — there are no settings to save here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Active provider
            </div>
            <div className="mt-1 text-base font-medium">
              {state.kind === "ready" ? (
                <>
                  {PROVIDER_LABELS[state.data.provider] ?? state.data.provider}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {state.data.source === "env"
                      ? "(from ARI_STORAGE_PROVIDER)"
                      : "(default — ARI_STORAGE_PROVIDER not set)"}
                  </span>
                </>
              ) : state.kind === "error" ? (
                <span className="text-sm text-muted-foreground">Unable to read storage status.</span>
              ) : (
                <span className="text-sm text-muted-foreground">Loading…</span>
              )}
            </div>
            {state.kind === "ready" && state.data.provider === "filesystem" && (
              <div className="mt-2 text-xs text-muted-foreground">
                Files are saved to <code className="rounded bg-background px-1.5 py-0.5 font-mono">data/storage/&#123;user_id&#125;/&#123;bucket&#125;/</code>
              </div>
            )}
          </div>

          <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              Storage credentials are read from <code className="rounded bg-blue-100 px-1 py-0.5 font-mono text-xs dark:bg-blue-900/40">.env.local</code>{" "}
              (or your platform&apos;s environment settings on Vercel/Fly/etc.). Edit the file and
              restart the dev server to apply changes — there is no save button.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileCode className="h-5 w-5 text-slate-500" />
            Environment variables
          </CardTitle>
          <CardDescription>
            Add these to <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env.local</code> for your chosen provider.
            Modules read <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">ARI_STORAGE_PROVIDER</code> to detect the active backend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(Object.keys(ENV_VARS) as Array<keyof typeof ENV_VARS>).map((key) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">{PROVIDER_LABELS[key]}</h3>
                {key === activeProvider && <Badge variant="outline" className="text-xs">Active</Badge>}
              </div>
              <pre className="rounded-lg border bg-muted/50 p-4 font-mono text-sm text-muted-foreground overflow-x-auto">
{ENV_VARS[key]}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
