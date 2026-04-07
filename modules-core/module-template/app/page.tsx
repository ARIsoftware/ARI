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

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Package, Plus, Trash2, BarChart3, Sparkles } from 'lucide-react'
import {
  useModuleTemplateEntries,
  useCreateModuleTemplateEntry,
  useDeleteModuleTemplateEntry,
  useModuleTemplateSettings,
  useUpdateModuleTemplateSettings,
} from '../hooks/use-module-template'
import type { ModuleTemplateEntry } from '../types'

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
  const { data: settings, isLoading: settingsLoading } = useModuleTemplateSettings()
  const updateSettings = useUpdateModuleTemplateSettings()

  // Local state for form
  const [newMessage, setNewMessage] = useState('')
  const [randomQuote, setRandomQuote] = useState<{ quote: string; author?: string } | null>(null)

  // Onboarding form state
  const [setupQuestion1, setSetupQuestion1] = useState('')
  const [setupQuestion2, setSetupQuestion2] = useState('')
  const [setupQuestion3, setSetupQuestion3] = useState('')

  // TEMPLATE MODULE: Always show onboarding by default so users can see the pattern
  // FOR REAL MODULES: Remove this state and use `!settings?.onboardingCompleted` instead
  const [showOnboardingDemo, setShowOnboardingDemo] = useState(true)

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

  /**
   * Handle onboarding setup completion
   * Saves the user's answers and marks onboarding as complete
   */
  const handleSetup = () => {
    if (!setupQuestion1.trim()) {
      toast({ variant: 'destructive', title: 'Please answer Sample Question 1' })
      return
    }

    updateSettings.mutate(
      {
        onboardingCompleted: true,
        sampleQuestion1: setupQuestion1.trim(),
        sampleQuestion2: setupQuestion2.trim(),
        sampleQuestion3: setupQuestion3.trim(),
      },
      {
        onError: () => {
          toast({ variant: 'destructive', title: 'Failed to save settings' })
        },
      }
    )
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

  // Loading state while fetching settings
  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

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
            <div className="space-y-2">
              <Label htmlFor="question1">Sample Question 1 *</Label>
              <Input
                id="question1"
                value={setupQuestion1}
                onChange={(e) => setSetupQuestion1(e.target.value)}
                placeholder="Your answer here..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="question2">Sample Question 2</Label>
              <Input
                id="question2"
                value={setupQuestion2}
                onChange={(e) => setSetupQuestion2(e.target.value)}
                placeholder="Optional answer..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="question3">Sample Question 3</Label>
              <Input
                id="question3"
                value={setupQuestion3}
                onChange={(e) => setSetupQuestion3(e.target.value)}
                placeholder="Optional answer..."
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSetup}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Get Started
            </Button>

            {/* TEMPLATE MODULE ONLY: Skip button to view main content */}
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setShowOnboardingDemo(false)}
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
            <p className="text-sm text-[#aa2020] mt-1">
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
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
      <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-blue-900 dark:text-blue-100">Developer Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
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
