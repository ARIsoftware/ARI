"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HardDrive, FileCode } from "lucide-react"
import { PROVIDER_LABELS } from "@/lib/storage/config"

const ENV_VARS: Record<string, string> = {
  filesystem: `Default`,
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardDrive className="h-5 w-5 text-emerald-500" />
            Storage Provider
          </CardTitle>
          {state.kind === "ready" && (
            <Badge variant="secondary">
              {PROVIDER_LABELS[state.data.provider] ?? state.data.provider}
            </Badge>
          )}
        </div>
        <CardDescription>
          Configure a storage provider where uploaded files (photos, documents, etc) will be
          stored. Modules will use the Storage Provider configured here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold">Setup your Storage Provider</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          To setup a Storage Provider, you need to add environmental variables to your local{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env.local</code>{" "}
          file or your hosting platform&apos;s environment manager on Vercel etc.) Edit the file
          and restart the dev server to apply changes.
        </p>

        <div className="mt-4 space-y-4">
            {(Object.keys(ENV_VARS) as Array<keyof typeof ENV_VARS>).map((key) => {
              const isActive = key === activeProvider
              return (
              <div key={key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{PROVIDER_LABELS[key]}</h3>
                  {isActive && (
                    <Badge
                      className="text-xs border-transparent text-white hover:bg-[#0f9a0f]"
                      style={{ backgroundColor: "#0f9a0f" }}
                    >
                      Active
                    </Badge>
                  )}
                </div>
                <pre
                  className={
                    isActive
                      ? "rounded-lg border border-transparent p-4 font-mono text-sm text-white overflow-x-auto"
                      : "rounded-lg border bg-muted/50 p-4 font-mono text-sm text-muted-foreground overflow-x-auto"
                  }
                  style={isActive ? { backgroundColor: "#0f9a0f" } : undefined}
                >
{ENV_VARS[key]}
{key === "filesystem" && activeProvider === "filesystem" && state.kind === "ready" && (
                    <>
                      {"\n\n"}
                      {state.data.source === "default" && "Default — ARI_STORAGE_PROVIDER not set\n"}
                      {"Files are saved to data/storage/{user_id}/{bucket}/"}
                    </>
                  )}
                </pre>
              </div>
              )
            })}
        </div>
      </CardContent>
    </Card>
  )
}
