/**
 * Hello World Module - Main Page
 *
 * This is the main page component for the Hello World module.
 * It demonstrates:
 * - Authentication context usage
 * - Database queries with Supabase
 * - Loading states
 * - Error handling
 * - ARI UI components
 *
 * IMPORTANT: This component is rendered via the catch-all route at
 * /app/[module]/[[...slug]]/page.tsx and MUST use default export.
 *
 * Route: /hello-world
 */

'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/providers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Package, Plus, Trash2 } from 'lucide-react'
import type { HelloWorldEntry } from '../types'

export default function HelloWorldPage() {
  // Access authentication context from ARI
  // This hook is provided by the core app at /components/providers.tsx
  const { session } = useSupabase()

  // State management for entries
  const [entries, setEntries] = useState<HelloWorldEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load entries on mount
  useEffect(() => {
    if (session?.access_token) {
      loadEntries()
    }
  }, [session])

  /**
   * Fetch all entries from the module API
   * Demonstrates: API calls with authentication
   */
  const loadEntries = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/modules/hello-world/data', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load entries')
      }

      const data = await response.json()
      setEntries(data.entries || [])
    } catch (err) {
      console.error('Error loading entries:', err)
      setError('Failed to load entries. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Create a new entry via the module API
   * Demonstrates: POST requests, input validation, state updates
   */
  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newMessage.trim()) {
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const response = await fetch('/api/modules/hello-world/data', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: newMessage })
      })

      if (!response.ok) {
        throw new Error('Failed to create entry')
      }

      // Clear input and reload entries
      setNewMessage('')
      await loadEntries()
    } catch (err) {
      console.error('Error creating entry:', err)
      setError('Failed to create entry. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Delete an entry
   * Demonstrates: DELETE requests, optimistic updates
   */
  const handleDeleteEntry = async (id: string) => {
    try {
      const response = await fetch(`/api/modules/hello-world/data?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to delete entry')
      }

      // Optimistically update UI
      setEntries(entries.filter(e => e.id !== id))
    } catch (err) {
      console.error('Error deleting entry:', err)
      setError('Failed to delete entry. Please try again.')
      // Reload to get correct state
      await loadEntries()
    }
  }

  // Loading state
  // Note: In production, this would show very briefly due to fast local DB
  if (!session || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2">
          <Package className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-medium">Hello World Module</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Welcome, {session.user.email}! This is a template module demonstrating core features.
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

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
              <div className="text-2xl font-medium">{session.user.email}</div>
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
              disabled={submitting}
              className="flex-1"
            />
            <Button type="submit" disabled={submitting || !newMessage.trim()}>
              {submitting ? (
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
            Messages stored in the hello_world_entries table
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
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
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
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Developer Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-2">
          <p>
            <strong>This is a template module.</strong> Use it as a reference when building your own modules.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Authentication: Uses <code>useSupabase()</code> hook from core app</li>
            <li>API Calls: Authenticates with Bearer token from session</li>
            <li>Database: Queries <code>hello_world_entries</code> table with RLS</li>
            <li>UI Components: Uses Shadcn/ui components from <code>@/components/ui</code></li>
            <li>TypeScript: Fully typed with custom types from <code>../types</code></li>
          </ul>
          <p className="pt-2">
            See <code>/modules/hello-world/README.md</code> for complete documentation.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
