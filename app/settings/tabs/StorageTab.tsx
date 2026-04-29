"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { HardDrive, Check, Eye, EyeOff, FileCode } from "lucide-react"

interface ProviderField {
  key: string
  label: string
  placeholder: string
  sensitive?: boolean
  required?: boolean
  maxLength?: number
  pattern?: RegExp
  patternHint?: string
}

const PROVIDER_OPTIONS = [
  { value: "filesystem", label: "Local Filesystem" },
  { value: "s3", label: "AWS S3" },
  { value: "r2", label: "Cloudflare R2" },
  { value: "supabase-s3", label: "Supabase Storage (S3)" },
] as const

const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.\-]*[a-z0-9]$/
const BUCKET_HINT = "Lowercase, start/end with alphanumeric, only a-z 0-9 hyphens dots"
const REGION_PATTERN = /^[a-z0-9\-]+$/
const REGION_HINT = "Lowercase alphanumeric with hyphens (e.g., us-east-1)"
const ACCESS_KEY_PATTERN = /^[A-Za-z0-9/+=_\-]+$/
const ACCESS_KEY_HINT = "Alphanumeric characters and /+=_- only"
const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9]+$/
const ACCOUNT_ID_HINT = "Alphanumeric characters only"

const PROVIDER_FIELDS: Record<string, ProviderField[]> = {
  s3: [
    { key: "s3AccessKeyId", label: "Access Key ID", placeholder: "AKIA...", required: true, maxLength: 128, pattern: ACCESS_KEY_PATTERN, patternHint: ACCESS_KEY_HINT },
    { key: "s3SecretAccessKey", label: "Secret Access Key", placeholder: "wJa...", sensitive: true, required: true, maxLength: 256 },
    { key: "s3Bucket", label: "Bucket Name", placeholder: "my-ari-storage", required: true, maxLength: 63, pattern: BUCKET_PATTERN, patternHint: BUCKET_HINT },
    { key: "s3Region", label: "Region", placeholder: "us-east-1", required: true, maxLength: 64, pattern: REGION_PATTERN, patternHint: REGION_HINT },
    { key: "s3Endpoint", label: "Custom Endpoint (optional)", placeholder: "https://s3.us-east-1.amazonaws.com", maxLength: 512 },
  ],
  r2: [
    { key: "r2AccountId", label: "Account ID", placeholder: "abc123...", required: true, maxLength: 64, pattern: ACCOUNT_ID_PATTERN, patternHint: ACCOUNT_ID_HINT },
    { key: "r2AccessKeyId", label: "Access Key ID", placeholder: "...", required: true, maxLength: 128, pattern: ACCESS_KEY_PATTERN, patternHint: ACCESS_KEY_HINT },
    { key: "r2SecretAccessKey", label: "Secret Access Key", placeholder: "...", sensitive: true, required: true, maxLength: 256 },
    { key: "r2Bucket", label: "Bucket Name", placeholder: "my-ari-storage", required: true, maxLength: 63, pattern: BUCKET_PATTERN, patternHint: BUCKET_HINT },
  ],
  "supabase-s3": [
    { key: "supabaseS3Endpoint", label: "S3 Endpoint", placeholder: "https://xxx.supabase.co/storage/v1/s3", required: true, maxLength: 512 },
    { key: "supabaseS3AccessKeyId", label: "Access Key ID", placeholder: "...", required: true, maxLength: 128, pattern: ACCESS_KEY_PATTERN, patternHint: ACCESS_KEY_HINT },
    { key: "supabaseS3SecretAccessKey", label: "Secret Access Key", placeholder: "...", sensitive: true, required: true, maxLength: 256 },
    { key: "supabaseS3Bucket", label: "Bucket Name", placeholder: "ari-storage", required: true, maxLength: 63, pattern: BUCKET_PATTERN, patternHint: BUCKET_HINT },
    { key: "supabaseS3Region", label: "Region", placeholder: "us-east-1", maxLength: 64, pattern: REGION_PATTERN, patternHint: REGION_HINT },
  ],
}

export function StorageTab(): React.ReactElement {
  const [provider, setProvider] = useState("filesystem")
  const [providerSaved, setProviderSaved] = useState("filesystem")
  const isVercel = !!process.env.NEXT_PUBLIC_IS_VERCEL
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState("")

  // Provider-specific field values (typed by user)
  const [fields, setFields] = useState<Record<string, string>>({})
  // Server-side masked values (for display when not editing)
  const [maskedFields, setMaskedFields] = useState<Record<string, string | null>>({})
  // Track which fields the user has modified
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set())
  // Track visibility of sensitive fields
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set())

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/settings/storage", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { provider?: string; config?: Record<string, unknown> } | null) => {
        if (data) {
          const prov = data.provider ?? "filesystem"
          setProvider(prov)
          setProviderSaved(prov)
          // Store masked values from server
          if (data.config) {
            const masked: Record<string, string | null> = {}
            for (const [k, v] of Object.entries(data.config)) {
              if (k !== "provider") masked[k] = typeof v === "string" ? v : null
            }
            setMaskedFields(masked)
          }
          setLoaded(true)
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  // Track per-field validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function handleFieldChange(key: string, value: string) {
    setFields(prev => ({ ...prev, [key]: value }))
    setDirtyFields(prev => new Set(prev).add(key))
    setFieldErrors(prev => { const { [key]: _, ...rest } = prev; return rest })
    setSaveError("")
  }

  function getDisplayValue(field: ProviderField): string {
    if (dirtyFields.has(field.key)) return fields[field.key] ?? ""
    if (field.sensitive && !visibleFields.has(field.key)) return maskedFields[field.key] ?? ""
    return maskedFields[field.key] ?? ""
  }

  function toggleVisibility(key: string) {
    setVisibleFields(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function validateFields(): boolean {
    const errors: Record<string, string> = {}
    const providerFields = PROVIDER_FIELDS[provider] || []
    for (const field of providerFields) {
      const value = dirtyFields.has(field.key) ? (fields[field.key] ?? "") : (maskedFields[field.key] ?? "")
      // Required check — only if the field was touched or has no saved value
      if (field.required && !value) {
        errors[field.key] = "Required"
        continue
      }
      if (!value || !dirtyFields.has(field.key)) continue
      if (field.maxLength && value.length > field.maxLength) {
        errors[field.key] = `Max ${field.maxLength} characters`
        continue
      }
      if (field.pattern && !field.pattern.test(value)) {
        errors[field.key] = field.patternHint || "Invalid format"
        continue
      }
      // URL validation for endpoint fields
      if (field.key.includes("Endpoint") && value) {
        try { new URL(value) } catch {
          errors[field.key] = "Must be a valid URL"
          continue
        }
      }
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const isDirty = provider !== providerSaved || dirtyFields.size > 0

  async function handleSave() {
    if (!validateFields()) return
    setSaving(true)
    setSaveError("")
    try {
      const body: Record<string, string> = { provider }
      // Include modified field values
      for (const key of dirtyFields) {
        body[key] = fields[key] ?? ""
      }
      // For provider switch, include all required fields for the new provider
      if (provider !== providerSaved) {
        const providerFields = PROVIDER_FIELDS[provider] || []
        for (const f of providerFields) {
          if (!(f.key in body)) {
            body[f.key] = fields[f.key] ?? ""
          }
        }
      }

      const res = await fetch("/api/settings/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        setProviderSaved(provider)
        setDirtyFields(new Set())
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        // Use masked config from POST response
        if (data.config) {
          const masked: Record<string, string | null> = {}
          for (const [k, v] of Object.entries(data.config)) {
            if (k !== "provider") masked[k] = typeof v === "string" ? v : null
          }
          setMaskedFields(masked)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        setSaveError((err as { error?: string }).error || "Failed to save")
      }
    } catch {
      setSaveError("Failed to save. Check your connection.")
    } finally {
      setSaving(false)
    }
  }

  function handleProviderChange(value: string) {
    setProvider(value)
    setFields({})
    setDirtyFields(new Set())
    setVisibleFields(new Set())
    setFieldErrors({})
    setSaveError("")
  }

  const currentFields = PROVIDER_FIELDS[provider] || []

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <HardDrive className="h-5 w-5 text-emerald-500" />
              File Storage
            </CardTitle>
            {loaded && (
              <Badge variant="secondary">
                {providerSaved === "filesystem" ? "Local" :
                 providerSaved === "s3" ? "AWS S3" :
                 providerSaved === "r2" ? "Cloudflare R2" :
                 providerSaved === "supabase-s3" ? "Supabase S3" : "Active"}
              </Badge>
            )}
          </div>
          <CardDescription>
            Configure where uploaded files (photos, documents, etc.) are stored. New modules will use this provider by default unless instructed otherwise.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Provider</Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="w-full sm:w-[340px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    disabled={isVercel && opt.value === "filesystem"}
                  >
                    {opt.label}
                    {isVercel && opt.value === "filesystem" && (
                      <span className="text-muted-foreground ml-1">(unavailable on Vercel)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {provider === "filesystem" && !isVercel && (
            <div className="space-y-2">
              <Label className="text-sm">Storage Path</Label>
              <p className="text-sm font-mono text-muted-foreground">data/storage/&#123;user_id&#125;/&#123;bucket&#125;/</p>
            </div>
          )}

          {provider === "filesystem" && isVercel && (
            <p className="text-sm text-muted-foreground">
              Local Filesystem is not available when running on Vercel because Vercel uses read-only, ephemeral serverless functions with no persistent disk storage. Please select a cloud storage provider above.
            </p>
          )}

          {currentFields.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                {currentFields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-sm">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </Label>
                    <div className="relative">
                      <Input
                        type={field.sensitive && !visibleFields.has(field.key) && !dirtyFields.has(field.key) ? "password" : "text"}
                        placeholder={field.placeholder}
                        value={getDisplayValue(field)}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        maxLength={field.maxLength}
                        className={`${field.sensitive ? "pr-10 " : ""}font-mono text-xs${fieldErrors[field.key] ? " border-red-500" : ""}`}
                      />
                      {field.sensitive && maskedFields[field.key] && !dirtyFields.has(field.key) && (
                        <button
                          type="button"
                          onClick={() => toggleVisibility(field.key)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {visibleFields.has(field.key) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                    {fieldErrors[field.key] && (
                      <p className="text-xs text-red-500">{fieldErrors[field.key]}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {(isDirty || saved) && (
            <div className="pt-2">
              <Button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="w-full sm:w-auto"
              >
                {saving ? "Saving..." : saved ? <><Check className="h-4 w-4 mr-1" /> Saved</> : "Save"}
              </Button>
            </div>
          )}

          {saveError && (
            <p className="text-xs text-red-500">{saveError}</p>
          )}
        </CardContent>
      </Card>

      {provider !== "filesystem" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileCode className="h-5 w-5 text-slate-500" />
              Using environment variables
            </CardTitle>
            <CardDescription>
              Prefer managing storage config outside the UI? Add these to your <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env.local</code> file. Environment variables take precedence over values saved through the UI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="rounded-lg border bg-muted/50 p-4 font-mono text-sm text-muted-foreground overflow-x-auto">
{ENV_VARS[provider]}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
