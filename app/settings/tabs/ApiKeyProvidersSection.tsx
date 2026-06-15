"use client"

import { useState, type ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Check, FileCode } from "lucide-react"
import { cn } from "@/lib/utils"
import { API_INTEGRATIONS_DOCS_URL } from "@/lib/constants"
import {
  useApiKeysStatus,
  useUpdateApiKeysStatusCache,
  type KeyStatus,
} from "@/hooks/use-api-keys-status"

export interface ProviderField {
  envKey: string
  placeholder: string
  label?: string
  optional?: boolean
}

export interface ModelField {
  envKey: string
  placeholder: string
}

export interface ProviderConfig {
  id: string
  name: string
  description: string
  envKey: string
  placeholder: string
  extraFields?: ProviderField[]
  modelField?: ModelField
  // When true, the primary `envKey` is not a secret and renders as a plain
  // text input (no password masking, no eye toggle). Used for fields like
  // Ollama's base URL which the user benefits from seeing at a glance.
  keyIsPlaintext?: boolean
}

interface Props {
  title: string
  icon: ReactNode
  providers: ProviderConfig[]
  envSnippet: string
}

function getAllEnvKeys(provider: ProviderConfig): string[] {
  const keys = [provider.envKey]
  if (provider.extraFields) {
    for (const f of provider.extraFields) keys.push(f.envKey)
  }
  if (provider.modelField) keys.push(provider.modelField.envKey)
  return keys
}

/** Return a shallow copy of `map` with the given keys removed. */
function withoutKeys<T>(map: Record<string, T>, keys: string[]): Record<string, T> {
  const next = { ...map }
  for (const k of keys) delete next[k]
  return next
}

export function ApiKeyProvidersSection({
  title,
  icon,
  providers,
  envSnippet,
}: Props): React.ReactElement {
  const { data: serverState = {} } = useApiKeysStatus()
  const patchStatusCache = useUpdateApiKeysStatusCache()
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  function handleKeyChange(envKey: string, value: string) {
    setTyped(prev => ({ ...prev, [envKey]: value }))
    setDirty(prev => ({ ...prev, [envKey]: true }))
    const provider = providers.find(p => p.envKey === envKey || p.extraFields?.some(f => f.envKey === envKey))
    if (provider) clearProviderError(provider.id)
  }

  function clearProviderError(providerId: string) {
    setErrors(prev => { const { [providerId]: _, ...rest } = prev; return rest })
  }

  async function handleSave(provider: ProviderConfig) {
    const toSave: { envKey: string; value: string }[] = []
    for (const envKey of getAllEnvKeys(provider)) {
      if (dirty[envKey]) toSave.push({ envKey, value: typed[envKey]?.trim() ?? "" })
    }
    if (toSave.length === 0) return

    setSaving(prev => ({ ...prev, [provider.id]: true }))
    clearProviderError(provider.id)

    try {
      const results = await Promise.all(
        toSave.map(async ({ envKey, value }) => {
          const res = await fetch("/api/settings/api-keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: envKey, value }),
          })
          if (!res.ok) return null
          const data = await res.json()
          if (!value) return { envKey, masked: null, deleted: true }
          return { envKey, masked: (data.masked ?? value.slice(0, 4) + "••••••••") as string, deleted: false }
        })
      )

      const succeeded = results.filter(Boolean)
      const failed = toSave.length - succeeded.length

      if (failed > 0) {
        setErrors(prev => ({ ...prev, [provider.id]: `Failed to save ${failed} key${failed > 1 ? "s" : ""}` }))
      }

      const savedKeys = succeeded.map(r => r!.envKey)
      const updates: Record<string, KeyStatus> = {}
      for (const r of succeeded) {
        if (r) updates[r.envKey] = r.deleted
          ? { configured: false, masked: null }
          : { configured: true, masked: r.masked }
      }
      patchStatusCache(updates)

      setTyped(prev => withoutKeys(prev, savedKeys))
      setDirty(prev => withoutKeys(prev, savedKeys))
    } catch {
      setErrors(prev => ({ ...prev, [provider.id]: "Failed to save. Check your connection and try again." }))
    } finally {
      setSaving(prev => ({ ...prev, [provider.id]: false }))
    }
  }

  function isConfigured(envKey: string): boolean {
    return serverState[envKey]?.configured ?? false
  }

  // Editable value for a plaintext (non-secret) field — model name or the
  // Ollama base URL. The stored value IS the displayed value; editing it in
  // place is safe because it is not a secret.
  function plaintextValue(envKey: string): string {
    if (dirty[envKey]) return typed[envKey] ?? ""
    return serverState[envKey]?.configured ? (serverState[envKey].masked ?? "") : ""
  }

  function renderField(envKey: string, placeholder: string, isSecret: boolean = true) {
    const configured = isConfigured(envKey)
    const isDirty = !!dirty[envKey]

    // Secrets are never echoed back into the input — there is no reveal. A
    // configured secret shows its masked value as a non-editable placeholder
    // and keeps the field empty, so clicking in reveals nothing and any edit
    // replaces the whole key (rather than appending to the mask characters).
    // Plaintext fields show their real value and stay editable in place.
    const value = isSecret
      ? (isDirty ? (typed[envKey] ?? "") : "")
      : plaintextValue(envKey)
    const fieldPlaceholder =
      isSecret && configured && !isDirty
        ? (serverState[envKey]?.masked ?? placeholder)
        : placeholder

    return (
      <div className="flex-1">
        <Input
          type={isSecret ? (isDirty ? "text" : "password") : "text"}
          placeholder={fieldPlaceholder}
          value={value}
          onChange={(e) => handleKeyChange(envKey, e.target.value)}
          className="font-mono text-xs"
        />
      </div>
    )
  }

  // Plaintext input for model name. Not a secret; placeholder shows the
  // hardcoded default that takes effect when the field is left blank.
  function renderModelField(envKey: string, placeholder: string) {
    return (
      <Input
        type="text"
        placeholder={placeholder}
        value={plaintextValue(envKey)}
        onChange={(e) => handleKeyChange(envKey, e.target.value)}
        className="font-mono text-xs"
      />
    )
  }

  function renderSaveButton(provider: ProviderConfig, className?: string) {
    const anyDirty = getAllEnvKeys(provider).some(k => dirty[k])
    const isSaving = !!saving[provider.id]
    const showSaved = isConfigured(provider.envKey) && !anyDirty && !isSaving
    return (
      <Button
        size="sm"
        variant={showSaved ? "outline" : "default"}
        onClick={() => handleSave(provider)}
        disabled={!anyDirty || isSaving}
        className={className}
      >
        {isSaving ? "Saving..." : showSaved ? <><Check className="h-4 w-4 mr-1" /> Saved</> : "Save"}
      </Button>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {icon}
            {title}
          </CardTitle>
          <CardDescription className="space-y-1">
            <span>Store your API keys here.</span>
            <span className="block">
              Alternatively store your API keys in your <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.local</code> which is a recommended security practice.{" "}
              <a
                href={API_INTEGRATIONS_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Learn more
              </a>
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {providers.map((provider) => {
            const saved = isConfigured(provider.envKey)
            const hasExtra = !!provider.extraFields
            const hasModel = !!provider.modelField
            // The Save button moves under the inputs whenever the card has
            // additional fields below the API key (extraFields or a model field).
            const buttonInline = !hasExtra && !hasModel

            return (
              <div
                key={provider.id}
                className={cn(
                  "rounded-xl border p-5",
                  // Alpha-based greens layer over any theme background
                  saved && "border-green-600/40 bg-green-600/40",
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">{provider.envKey}</p>
                  </div>
                  {saved ? (
                    <Badge className="border-transparent bg-green-600/20 text-green-800 hover:bg-green-600/20 dark:bg-green-500/25 dark:text-green-300">
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not configured</Badge>
                  )}
                </div>
                <Separator className="my-4" />
                <p className="text-sm text-muted-foreground">
                  {provider.description}
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex gap-2">
                    {renderField(provider.envKey, provider.placeholder, !provider.keyIsPlaintext)}
                    {buttonInline && renderSaveButton(provider)}
                  </div>
                  {provider.modelField && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        Specify the model you want to use (optional)
                      </p>
                      {renderModelField(provider.modelField.envKey, provider.modelField.placeholder)}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Leave blank to use the default ({provider.modelField.placeholder}).
                      </p>
                    </div>
                  )}
                  {provider.extraFields?.map((field) => (
                    <div key={field.envKey}>
                      <p className="text-xs text-muted-foreground mb-1">
                        {field.label || field.envKey}{field.optional ? " (optional)" : ""}
                      </p>
                      {renderField(field.envKey, field.placeholder)}
                    </div>
                  ))}
                  {!buttonInline && renderSaveButton(provider, "w-full")}
                  {errors[provider.id] && (
                    <p className="text-xs text-red-500">{errors[provider.id]}</p>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileCode className="h-5 w-5 text-slate-500" />
            Using environment variables
          </CardTitle>
          <CardDescription>
            Prefer managing keys outside the UI? Add them directly to your <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env.local</code> file in the project root. Environment variables take precedence over values saved through the UI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-lg border bg-muted/50 p-4 font-mono text-sm text-muted-foreground overflow-x-auto">
            {envSnippet}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
