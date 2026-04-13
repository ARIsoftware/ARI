"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Plug, Eye, EyeOff, Check, FileCode } from "lucide-react"

interface ProviderConfig {
  id: string
  name: string
  description: string
  envKey: string
  placeholder: string
}

const providers: ProviderConfig[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Unified API gateway for multiple LLM providers.",
    envKey: "OPENROUTER_API_KEY",
    placeholder: "sk-or-...",
  },
  {
    id: "claude",
    name: "Claude",
    description: "Anthropic's Claude models for advanced reasoning.",
    envKey: "ANTHROPIC_API_KEY",
    placeholder: "sk-ant-...",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models for chat, code, and embeddings.",
    envKey: "OPENAI_API_KEY",
    placeholder: "sk-...",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Google's Gemini models for multimodal tasks.",
    envKey: "GOOGLE_GEMINI_API_KEY",
    placeholder: "AIza...",
  },
]

export function IntegrationsTab(): React.ReactElement {
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  function handleKeyChange(id: string, value: string) {
    setKeys(prev => ({ ...prev, [id]: value }))
    setSaved(prev => ({ ...prev, [id]: false }))
  }

  function toggleVisibility(id: string) {
    setVisibility(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSave(provider: ProviderConfig) {
    const key = keys[provider.id]?.trim()
    if (!key) return

    try {
      const response = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: provider.envKey, value: key }),
      })

      if (response.ok) {
        setSaved(prev => ({ ...prev, [provider.id]: true }))
      }
    } catch (error) {
      console.error(`Failed to save ${provider.name} key:`, error)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plug className="h-5 w-5 text-indigo-500" />
            Connected apps
          </CardTitle>
          <CardDescription>
            Store your AI API keys here.{" "}
            <a
              href="https://ari.software/docs/api-integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Learn more
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {providers.map((provider) => {
            const value = keys[provider.id] || ""
            const isVisible = visibility[provider.id] || false
            const isSaved = saved[provider.id] || false

            return (
              <div key={provider.id} className="rounded-xl border p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">{provider.envKey}</p>
                  </div>
                  {isSaved ? (
                    <Badge variant="secondary">Saved</Badge>
                  ) : (
                    <Badge variant="outline">Not configured</Badge>
                  )}
                </div>
                <Separator className="my-4" />
                <p className="text-sm text-muted-foreground">
                  {provider.description}
                </p>
                <div className="mt-4 flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={isVisible ? "text" : "password"}
                      placeholder={provider.placeholder}
                      value={value}
                      onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                      className="pr-10 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisibility(provider.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    size="sm"
                    variant={isSaved ? "outline" : "default"}
                    onClick={() => handleSave(provider)}
                    disabled={!value.trim()}
                  >
                    {isSaved ? <Check className="h-4 w-4" /> : "Save"}
                  </Button>
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
{`OPENROUTER_API_KEY=sk-ajg...
ANTHROPIC_API_KEY=sk-ant...
OPENAI_API_KEY=sk-dfdf...
GOOGLE_GEMINI_API_KEY=AIza...`}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
