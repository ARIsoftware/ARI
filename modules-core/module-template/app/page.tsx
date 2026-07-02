/**
 * Module Template Module - Main Page
 *
 * This is the main page component for the Module Template module.
 * It demonstrates:
 * - TanStack Query for data fetching
 * - Optimistic updates for instant UI feedback
 * - Modern Better Auth patterns (no session blocking)
 * - ARI UI components
 * - Onboarding/setup screen pattern
 *
 * IMPORTANT: This component is rendered via the catch-all route at
 * /app/[module]/[[...slug]]/page.tsx and MUST use default export.
 *
 * ONBOARDING PATTERN:
 * This template module ALWAYS shows the onboarding screen as a reference.
 * When creating a real module, replace the condition with:
 *
 *   if (!settings?.onboardingCompleted) {
 *     return <OnboardingScreen />
 *   }
 *
 * This will show onboarding only until the user completes it.
 *
 * Route: /module-template
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/providers'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Loader2, Package, Plus, Trash2, BarChart3, Sparkles } from 'lucide-react'
import {
  useModuleTemplateEntries,
  useCreateModuleTemplateEntry,
  useDeleteModuleTemplateEntry,
  useModuleTemplateSettings,
  useUpdateModuleTemplateSettings,
} from '../hooks/use-module-template'
import type { ModuleTemplateEntry } from '../types'

// Onboarding question config — drives both the JSX render and validation.
// `max` mirrors the server Zod schema in api/settings/route.ts (defense-in-depth).
type QuestionField = 'sampleQuestion1' | 'sampleQuestion2' | 'sampleQuestion3'
const QUESTION_MAX = 500
const QUESTIONS: Array<{ field: QuestionField; label: string; placeholder: string; required: boolean }> = [
  { field: 'sampleQuestion1', label: 'Sample Question 1 *', placeholder: 'Your answer here...', required: true },
  { field: 'sampleQuestion2', label: 'Sample Question 2', placeholder: 'Optional answer...', required: false },
  { field: 'sampleQuestion3', label: 'Sample Question 3', placeholder: 'Optional answer...', required: false },
]
const EMPTY_ANSWERS: Record<QuestionField, string> = {
  sampleQuestion1: '',
  sampleQuestion2: '',
  sampleQuestion3: '',
}

export default function ModuleTemplatePage() {
  const { user } = useAuth()
  const { toast } = useToast()

  // Check if quotes module is enabled
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')

  // TanStack Query hooks for data fetching
  const { data: entries = [], isLoading } = useModuleTemplateEntries()
  const createEntry = useCreateModuleTemplateEntry()
  const deleteEntry = useDeleteModuleTemplateEntry()

  // Settings hooks for onboarding
  const { data: settings } = useModuleTemplateSettings()
  const updateSettings = useUpdateModuleTemplateSettings()

  // Local state for form
  const [newMessage, setNewMessage] = useState('')
  const [randomQuote, setRandomQuote] = useState<{ quote: string; author?: string } | null>(null)

  // AI generation demo state — exercises the user's selected AI provider.
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [reply, setReply] = useState<{ text: string; provider: string; model: string } | null>(null)

  const [answers, setAnswers] = useState<Record<QuestionField, string>>(EMPTY_ANSWERS)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<QuestionField, string>>>({})
  const [justSaved, setJustSaved] = useState(false)
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // TEMPLATE MODULE: Always show onboarding by default so users can see the pattern.
  // FOR REAL MODULES: Remove this state and use `!settings?.onboardingCompleted` instead.
  const [showOnboardingDemo, setShowOnboardingDemo] = useState(true)

  // Hydrate the form from saved settings once. Guarded so background refetches
  // (e.g. after the mutation's onSettled invalidate) don't stomp keystrokes.
  const hydrated = useRef(false)
  useEffect(() => {
    if (settings && !hydrated.current) {
      setAnswers({
        sampleQuestion1: settings.sampleQuestion1 ?? '',
        sampleQuestion2: settings.sampleQuestion2 ?? '',
        sampleQuestion3: settings.sampleQuestion3 ?? '',
      })
      hydrated.current = true
    }
  }, [settings])

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
  }, [])

  // Load random quote when quotes module is enabled
  useEffect(() => {
    if (!quotesEnabled || quotesLoading) return
    let cancelled = false
    fetch('/api/modules/quotes/quotes')
      .then((res) => (res.ok ? res.json() : []))
      .then((quotes) => {
        if (!cancelled && quotes.length > 0) {
          setRandomQuote(quotes[Math.floor(Math.random() * quotes.length)])
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [quotesEnabled, quotesLoading])

  // Mirrors the server Zod schema in api/settings/route.ts. Server is still the
  // source of truth — these checks just give immediate inline feedback.
  const validateForm = () => {
    const errs: Partial<Record<QuestionField, string>> = {}
    for (const { field, required } of QUESTIONS) {
      const value = answers[field].trim()
      if (required && !value) {
        errs[field] = 'This question is required'
      } else if (value.length > QUESTION_MAX) {
        errs[field] = `Must be ${QUESTION_MAX} characters or fewer`
      }
    }
    return errs
  }

  const handleSetup = () => {
    const errs = validateForm()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    updateSettings.mutate(
      {
        onboardingCompleted: true,
        sampleQuestion1: answers.sampleQuestion1.trim(),
        sampleQuestion2: answers.sampleQuestion2.trim(),
        sampleQuestion3: answers.sampleQuestion3.trim(),
      },
      {
        onSuccess: () => {
          setJustSaved(true)
          toast({ title: 'Onboarding complete', description: 'Your answers were saved.' })
          // FOR REAL MODULES: drop the timer — the transition is reactive once
          // the page renders against `!settings?.onboardingCompleted`.
          transitionTimer.current = setTimeout(() => {
            setJustSaved(false)
            setShowOnboardingDemo(false)
          }, 900)
        },
        onError: (err: unknown) => {
          const message = err instanceof Error ? err.message : 'Please try again.'
          toast({ variant: 'destructive', title: 'Failed to save settings', description: message })
        },
      },
    )
  }

  const updateAnswer = (field: QuestionField, value: string) => {
    setAnswers((prev) => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  /**
   * Create a new entry
   * Uses optimistic updates via TanStack Query mutation
   */
  const handleCreateEntry = (e: React.FormEvent) => {
    e.preventDefault()

    if (!newMessage.trim()) return

    // Clear input immediately (optimistic UX)
    const message = newMessage.trim()
    setNewMessage('')

    createEntry.mutate(message, {
      onError: () => {
        // Restore input on error
        setNewMessage(message)
        toast({
          variant: 'destructive',
          title: 'Failed to create entry',
          description: 'Please try again.',
        })
      },
    })
  }

  /**
   * Generate a response using the user's selected AI provider.
   * Hits the module's /generate route, which resolves the provider + key
   * server-side. Surfaces the "no provider / no key" cases as toasts.
   */
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || generating) return

    setGenerating(true)
    setReply(null)
    try {
      const res = await fetch('/api/modules/module-template/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: 'Generation failed',
          description: data?.error ?? 'Please try again.',
        })
        return
      }
      setReply(data)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Generation failed',
        description: 'Check your connection and try again.',
      })
    } finally {
      setGenerating(false)
    }
  }

  /**
   * Delete an entry
   * Uses optimistic updates via TanStack Query mutation
   */
  const handleDeleteEntry = (id: string) => {
    deleteEntry.mutate(id, {
      onError: () => {
        toast({
          variant: 'destructive',
          title: 'Failed to delete entry',
          description: 'Please try again.',
        })
      },
    })
  }

  // NOTE: We intentionally do NOT block the whole page on the settings fetch.
  // Rendering immediately (and letting the form hydrate from `settings` via the
  // effect above) avoids a spinner flash on load. The onboarding form fields fill
  // in the moment the query resolves. FOR REAL MODULES: if your view choice depends
  // on settings, prefer a default that won't visibly reverse, or show a skeleton for
  // just the data-dependent section — not the entire page.

  /**
   * ONBOARDING SCREEN
   *
   * TEMPLATE MODULE: Uses `showOnboardingDemo` state to always show this as a reference.
   *
   * FOR REAL MODULES: Replace this condition with:
   *   if (!settings?.onboardingCompleted) {
   *
   * This ensures the onboarding only shows until the user completes it.
   */
  if (showOnboardingDemo) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Welcome to Module Template</CardTitle>
            <CardDescription>
              This is a sample onboarding screen. Use this pattern when your module needs
              to collect initial configuration from the user before they can use it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {QUESTIONS.map(({ field, label, placeholder }) => {
              const error = fieldErrors[field]
              const errorId = error ? `${field}-error` : undefined
              return (
                <div key={field} className="space-y-2">
                  <Label htmlFor={field}>{label}</Label>
                  <Input
                    id={field}
                    value={answers[field]}
                    onChange={(e) => updateAnswer(field, e.target.value)}
                    placeholder={placeholder}
                    maxLength={QUESTION_MAX}
                    disabled={updateSettings.isPending}
                    aria-invalid={!!error}
                    aria-describedby={errorId}
                    className={cn(error && 'border-red-500 focus-visible:ring-red-500')}
                  />
                  {error && (
                    <p id={errorId} className="text-xs text-destructive">{error}</p>
                  )}
                </div>
              )
            })}
            <Button
              className="w-full"
              onClick={handleSetup}
              disabled={updateSettings.isPending || justSaved}
            >
              {updateSettings.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : justSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                  Saved!
                </>
              ) : (
                'Get Started'
              )}
            </Button>

            {/* TEMPLATE MODULE ONLY: Skip button to view main content */}
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setShowOnboardingDemo(false)}
              disabled={updateSettings.isPending}
            >
              Skip to Module Demo
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main view (after onboarding complete)
  return (
    <div className="p-6 space-y-6">
      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50">
          <div className="flex items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-medium">Module Template</h1>
          {quotesEnabled && randomQuote && (
            <p className="text-sm text-muted-foreground mt-1">
              {randomQuote.quote}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* TEMPLATE MODULE ONLY: Button to view onboarding demo */}
          <Button variant="outline" onClick={() => setShowOnboardingDemo(true)}>
            <Sparkles className="w-4 h-4 mr-2" />
            View Onboarding Demo
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Button A
          </Button>
          <Button variant="outline">
            <BarChart3 className="w-4 h-4 mr-2" />
            Button B
          </Button>
        </div>
      </div>

      {/* Quick Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle>Module Statistics</CardTitle>
          <CardDescription>
            Your interaction with this module
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-medium">{entries.length}</div>
              <p className="text-xs text-muted-foreground">Total Entries</p>
            </div>
            <div>
              <div className="text-2xl font-medium">{user?.email || 'Loading...'}</div>
              <p className="text-xs text-muted-foreground">Current User</p>
            </div>
            <div>
              <div className="text-2xl font-medium">v1.0.0</div>
              <p className="text-xs text-muted-foreground">Module Version</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Entry Form */}
      <Card>
        <CardHeader>
          <CardTitle>Create New Entry</CardTitle>
          <CardDescription>
            Add a new message to demonstrate API integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateEntry} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Enter a message..."
              disabled={createEntry.isPending}
              className="flex-1"
            />
            <Button type="submit" disabled={createEntry.isPending || !newMessage.trim()}>
              {createEntry.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* AI Generation Demo — exercises the selected AI provider end-to-end */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Generation
          </CardTitle>
          <CardDescription>
            Generate a response using the AI provider selected in this module&apos;s settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleGenerate} className="flex gap-2">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask the model something..."
              disabled={generating}
              maxLength={2000}
              className="flex-1"
            />
            <Button type="submit" disabled={generating || !prompt.trim()}>
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </form>
          {reply && (
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="whitespace-pre-wrap text-sm">{reply.text}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                via {reply.provider} · {reply.model}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entries List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Entries</CardTitle>
          <CardDescription>
            Messages stored in the module_template_entries table
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No entries yet. Create one above to get started!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry: ModuleTemplateEntry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium">{entry.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteEntry(entry.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Module Info */}
      <Card className="bg-muted/50 border-border">
        <CardHeader>
          <CardTitle>Developer Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>This is a template module.</strong> Use it as a reference when building your own modules.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Data Fetching: Uses TanStack Query hooks from <code>@/lib/hooks/use-module-template</code></li>
            <li>API Calls: Authentication handled via cookies (Better Auth)</li>
            <li>Database: Uses Drizzle ORM with <code>withRLS()</code> helper</li>
            <li>UI Components: Uses Shadcn/ui components from <code>@/components/ui</code></li>
            <li>TypeScript: Fully typed with custom types from <code>../types</code></li>
          </ul>
          <p className="pt-2">
            See <code>/modules/module-template/README.md</code> for complete documentation.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
