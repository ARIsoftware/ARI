'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Check, ExternalLink, Loader2, Plug, Settings as SettingsIcon } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  useChatProviders,
  useChatSettings,
  useUpdateChatSettings,
} from '@/modules/chat/hooks/use-chat'
import { useRandomQuote } from '@/modules/chat/hooks/use-quote'
import { cn } from '@/lib/utils'
import type { ChatProvider } from '@/modules/chat/types'

const MAX_MODEL_LEN = 128

export default function ChatSettingsPage() {
  const { toast } = useToast()
  const randomQuote = useRandomQuote()

  const { data: providers = [], isLoading: providersLoading } = useChatProviders()
  const { data: settings, isLoading: settingsLoading } = useChatSettings()
  const updateSettings = useUpdateChatSettings()

  const [selectedProvider, setSelectedProvider] = useState<ChatProvider | null>(null)
  const [modelValue, setModelValue] = useState('')
  const [modelError, setModelError] = useState<string | null>(null)

  const configuredProviders = useMemo(() => providers.filter((p) => p.configured), [providers])

  useEffect(() => {
    if (settings) {
      const provider = settings.defaultProvider ?? configuredProviders[0]?.id ?? null
      setSelectedProvider(provider ?? null)
      const matched = providers.find((p) => p.id === provider)
      setModelValue(
        settings.defaultModel ?? matched?.configuredModel ?? matched?.defaultModel ?? ''
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.defaultProvider, settings?.defaultModel, configuredProviders.length])

  const handleSave = () => {
    if (!selectedProvider) {
      toast({
        variant: 'destructive',
        title: 'Pick a provider',
        description: 'Choose one of the configured providers first.',
      })
      return
    }

    const trimmed = modelValue.trim()
    if (!trimmed) {
      setModelError('Model name is required')
      return
    }
    if (trimmed.length > MAX_MODEL_LEN) {
      setModelError(`Model name must be ${MAX_MODEL_LEN} characters or fewer`)
      return
    }
    setModelError(null)

    updateSettings.mutate(
      { defaultProvider: selectedProvider, defaultModel: trimmed },
      {
        onSuccess: () => toast({ title: 'Saved', description: 'Chat preferences updated.' }),
        onError: (err) => toast({
          variant: 'destructive',
          title: 'Failed to save',
          description: err instanceof Error ? err.message : 'Please try again.',
        }),
      },
    )
  }

  const handlePickProvider = (id: ChatProvider) => {
    setSelectedProvider(id)
    const next = providers.find((p) => p.id === id)
    if (next) setModelValue(next.configuredModel ?? next.defaultModel)
  }

  const selectedMeta = providers.find((p) => p.id === selectedProvider)

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-medium">Chat settings</h1>
        {randomQuote && (
          <p className="text-sm text-[#aa2020] mt-1">{randomQuote.quote}</p>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          Pick which provider new chats use by default. API keys are managed in
          <Link href="/settings?tab=integrations" className="underline hover:text-foreground ml-1">Settings → Integrations</Link>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plug className="w-5 h-5 text-indigo-500" />
            Configured providers
          </CardTitle>
          <CardDescription>
            Only providers with an API key set are available. Configure more keys in Integrations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {providersLoading || settingsLoading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No providers found.</p>
          ) : (
            providers.map((provider) => {
              const isSelected = selectedProvider === provider.id
              return (
                <button
                  key={provider.id}
                  type="button"
                  disabled={!provider.configured}
                  onClick={() => provider.configured && handlePickProvider(provider.id)}
                  className={cn(
                    'w-full text-left rounded-xl border p-4 transition-colors',
                    provider.configured ? 'hover:border-primary cursor-pointer' : 'opacity-60 cursor-not-allowed',
                    isSelected && 'border-primary bg-primary/5',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{provider.name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        Default model: {provider.configuredModel ?? provider.defaultModel}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {provider.configured ? (
                        <Badge variant="secondary">Key configured</Badge>
                      ) : (
                        <Badge variant="outline">No key</Badge>
                      )}
                      {isSelected && (
                        <span className="rounded-full bg-primary text-primary-foreground p-1">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}

          <div className="pt-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/settings?tab=integrations">
                Manage API keys
                <ExternalLink className="w-3 h-3 ml-2 opacity-60" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <SettingsIcon className="w-5 h-5 text-slate-500" />
            Default model
          </CardTitle>
          <CardDescription>
            The model new chats start with. You can override per-chat later (coming soon).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={selectedProvider ?? undefined}
              onValueChange={(v) => handlePickProvider(v as ChatProvider)}
              disabled={configuredProviders.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a provider" />
              </SelectTrigger>
              <SelectContent>
                {configuredProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model name</Label>
            <Input
              id="model"
              value={modelValue}
              maxLength={MAX_MODEL_LEN}
              onChange={(e) => {
                setModelValue(e.target.value)
                if (modelError) setModelError(null)
              }}
              placeholder={selectedMeta?.defaultModel ?? 'e.g. gpt-5'}
              disabled={!selectedProvider}
              aria-invalid={!!modelError}
              className={cn(modelError && 'border-red-500 focus-visible:ring-red-500')}
            />
            {modelError ? (
              <p className="text-xs text-red-500">{modelError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Default if blank: {selectedMeta?.configuredModel ?? selectedMeta?.defaultModel ?? '—'}
              </p>
            )}
          </div>

          <div className="pt-2">
            <Button onClick={handleSave} disabled={updateSettings.isPending || !selectedProvider}>
              {updateSettings.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save preferences
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
