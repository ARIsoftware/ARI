"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Plug, Eye, EyeOff, Check, FileCode } from "lucide-react"

interface ProviderField {
  envKey: string
  placeholder: string
  label?: string
  optional?: boolean
}

interface ModelField {
  envKey: string
  placeholder: string
}

interface ProviderConfig {
  id: string
  name: string
  description: string
  envKey: string
  placeholder: string
  extraFields?: ProviderField[]
  modelField?: ModelField
}

const providers: ProviderConfig[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Unified API gateway for multiple LLM providers.",
    envKey: "OPENROUTER_API_KEY",
    placeholder: "",
    modelField: { envKey: "OPENROUTER_MODEL", placeholder: "openrouter/auto" },
  },
  {
    id: "claude",
    name: "Claude",
    description: "Anthropic's Claude models for advanced reasoning.",
    envKey: "ANTHROPIC_API_KEY",
    placeholder: "",
    modelField: { envKey: "ANTHROPIC_MODEL", placeholder: "claude-sonnet-4-5" },
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models for chat, code, and embeddings.",
    envKey: "OPENAI_API_KEY",
    placeholder: "",
    modelField: { envKey: "OPENAI_MODEL", placeholder: "gpt-5" },
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Google's Gemini models for multimodal tasks.",
    envKey: "GOOGLE_GEMINI_API_KEY",
    placeholder: "",
    modelField: { envKey: "GOOGLE_GEMINI_MODEL", placeholder: "gemini-2.5-flash" },
  },
  {
    id: "resend",
    name: "Resend",
    description: "Transactional email API for notifications.",
    envKey: "RESEND_API_KEY",
    placeholder: "",
    extraFields: [
      {
        envKey: "RESEND_WEBHOOK_SECRET",
        placeholder: "",
        label: "Webhook Secret",
        optional: true,
      },
    ],
  },
]

type KeyStatus = { configured: boolean; masked: string | null }

function getAllEnvKeys(provider: ProviderConfig): string[] {
  const keys = [provider.envKey]
  if (provider.extraFields) {
    for (const f of provider.extraFields) keys.push(f.envKey)
  }
  if (provider.modelField) keys.push(provider.modelField.envKey)
  return keys
}

export function IntegrationsTab(): React.ReactElement {
  const [serverState, setServerState] = useState<Record<string, KeyStatus>>({})
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/settings/api-keys", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Record<string, KeyStatus> | null) => {
        if (data) setServerState(data)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  function handleKeyChange(envKey: string, value: string) {
    setTyped(prev => ({ ...prev, [envKey]: value }))
    setDirty(prev => ({ ...prev, [envKey]: true }))
    setRevealed(prev => { const { [envKey]: _, ...rest } = prev; return rest })
    // Clear any error for the provider this key belongs to
    const provider = providers.find(p => p.envKey === envKey || p.extraFields?.some(f => f.envKey === envKey))
    if (provider) clearProviderError(provider.id)
  }

  function clearProviderError(providerId: string) {
    setErrors(prev => { const { [providerId]: _, ...rest } = prev; return rest })
  }

  async function toggleVisibility(envKey: string) {
    if (envKey in revealed) {
      setRevealed(prev => { const { [envKey]: _, ...rest } = prev; return rest })
      return
    }
    try {
      const res = await fetch(`/api/settings/api-keys?reveal=${encodeURIComponent(envKey)}`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.value) return
      if (dirty[envKey]) return
      setRevealed(prev => ({ ...prev, [envKey]: data.value }))
    } catch {}
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
      setServerState(prev => ({ ...prev, ...updates }))

      setTyped(prev => {
        const next = { ...prev }
        for (const k of savedKeys) delete next[k]
        return next
      })
      setDirty(prev => {
        const next = { ...prev }
        for (const k of savedKeys) delete next[k]
        return next
      })
      setRevealed(prev => {
        const next = { ...prev }
        for (const k of savedKeys) delete next[k]
        return next
      })
    } catch {
      setErrors(prev => ({ ...prev, [provider.id]: "Failed to save. Check your connection and try again." }))
    } finally {
      setSaving(prev => ({ ...prev, [provider.id]: false }))
    }
  }

  function isConfigured(envKey: string): boolean {
    return serverState[envKey]?.configured ?? false
  }

  function getDisplayValue(envKey: string): string {
    if (dirty[envKey]) return typed[envKey] ?? ""
    if (envKey in revealed) return revealed[envKey]
    return serverState[envKey]?.configured ? (serverState[envKey].masked ?? "") : ""
  }

  function isVisible(envKey: string): boolean {
    return !!dirty[envKey] || envKey in revealed
  }

  function renderField(envKey: string, placeholder: string) {
    const configured = isConfigured(envKey)
    const isDirty = !!dirty[envKey]

    return (
      <div className="relative flex-1">
        <Input
          type={isVisible(envKey) ? "text" : "password"}
          placeholder={placeholder}
          value={getDisplayValue(envKey)}
          onChange={(e) => handleKeyChange(envKey, e.target.value)}
          className="pr-10 font-mono text-xs"
        />
        {configured && !isDirty && (
          <button
            type="button"
            onClick={() => toggleVisibility(envKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {envKey in revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
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
        value={getDisplayValue(envKey)}
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
            <Plug className="h-5 w-5 text-indigo-500" />
            Connected apps
          </CardTitle>
          <CardDescription className="space-y-1">
            <span>Store your API keys here.</span>
            <span className="block">
              Alternatively store your API keys in your <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.local</code> which is a recommended security practice.{" "}
              <a
                href="https://ari.software/docs/api-integrations"
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
              <div key={provider.id} className="rounded-xl border p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">{provider.envKey}</p>
                  </div>
                  {saved ? (
                    <Badge variant="secondary">Saved</Badge>
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
                    {renderField(provider.envKey, provider.placeholder)}
                    {buttonInline && renderSaveButton(provider)}
                  </div>
                  {provider.modelField && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        Model <span className="font-mono">({provider.modelField.envKey})</span>
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
{`OPENROUTER_API_KEY=
OPENROUTER_MODEL=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
OPENAI_API_KEY=
OPENAI_MODEL=
GOOGLE_GEMINI_API_KEY=
GOOGLE_GEMINI_MODEL=
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=`}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
