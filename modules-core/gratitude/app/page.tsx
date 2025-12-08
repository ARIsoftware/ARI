/**
 * Gratitude Module - Main Page
 *
 * A daily gratitude journal with 5 reflection questions.
 * Features:
 * - Large textarea inputs for each question
 * - Date navigation to view past entries
 * - Auto-save functionality
 *
 * Route: /gratitude
 */

'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/components/providers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { GRATITUDE_QUESTIONS } from '../types'
import type { GratitudeEntry } from '../types'

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Format date for display
function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Check if a date is today
function isToday(dateStr: string): boolean {
  return dateStr === formatDate(new Date())
}

export default function GratitudePage() {
  const { session } = useSupabase()

  // Current date being viewed
  const [currentDate, setCurrentDate] = useState<string>(formatDate(new Date()))

  // Form state
  const [answers, setAnswers] = useState<Record<string, string>>({
    question1: '',
    question2: '',
    question3: '',
    question4: '',
    question5: '',
  })

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Load entry when date changes
  useEffect(() => {
    const loadEntry = async () => {
      if (!session?.access_token) return

      try {
        setLoading(true)
        // Reset state for new date
        setHasChanges(false)
        setLastSaved(null)

        const response = await fetch(`/api/modules/gratitude/entries?date=${currentDate}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (!response.ok) {
          throw new Error('Failed to load entry')
        }

        const data = await response.json()
        const entry: GratitudeEntry | null = data.entry

        if (entry) {
          setAnswers({
            question1: entry.question1 || '',
            question2: entry.question2 || '',
            question3: entry.question3 || '',
            question4: entry.question4 || '',
            question5: entry.question5 || '',
          })
        } else {
          // No entry for this date, reset form
          setAnswers({
            question1: '',
            question2: '',
            question3: '',
            question4: '',
            question5: '',
          })
        }
      } catch (error) {
        console.error('Error loading entry:', error)
      } finally {
        setLoading(false)
      }
    }

    loadEntry()
  }, [session?.access_token, currentDate])

  // Save entry
  const saveEntry = async () => {
    if (!session?.access_token) return

    try {
      setSaving(true)
      const response = await fetch('/api/modules/gratitude/entries', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          entry_date: currentDate,
          ...answers
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save entry')
      }

      setHasChanges(false)
      setLastSaved(new Date())
    } catch (error) {
      console.error('Error saving entry:', error)
    } finally {
      setSaving(false)
    }
  }

  // Handle answer change
  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }))
    setHasChanges(true)
  }

  // Navigate to previous day
  const goToPreviousDay = () => {
    const date = new Date(currentDate + 'T12:00:00')
    date.setDate(date.getDate() - 1)
    setCurrentDate(formatDate(date))
  }

  // Navigate to next day
  const goToNextDay = () => {
    const date = new Date(currentDate + 'T12:00:00')
    date.setDate(date.getDate() + 1)
    setCurrentDate(formatDate(date))
  }

  // Go to today
  const goToToday = () => {
    setCurrentDate(formatDate(new Date()))
  }

  // Loading state
  if (!session) {
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
      {/* Page Header - matching Hello World style */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-medium">Gratitude</h1>
          <p className="text-sm text-[#aa2020] mt-1">
            Gratitude turns what we have into enough.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPreviousDay}
            title="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="text-center min-w-[200px]">
            <div className="font-medium">
              {formatDisplayDate(currentDate)}
            </div>
            {!isToday(currentDate) && (
              <button
                onClick={goToToday}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Go to today
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={goToNextDay}
            disabled={isToday(currentDate)}
            title="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Questions form */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {GRATITUDE_QUESTIONS.map((question, index) => (
            <Card key={question.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium">
                  {index + 1}. {question.text}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={answers[question.id]}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                  placeholder="Take a moment to reflect..."
                  className="min-h-[120px] resize-y text-base"
                />
              </CardContent>
            </Card>
          ))}

          {/* Save button and status */}
          <div className="flex items-center justify-between pt-4">
            <div className="text-sm text-muted-foreground">
              {lastSaved && (
                <span>Last saved: {lastSaved.toLocaleTimeString()}</span>
              )}
              {hasChanges && lastSaved && (
                <span className="ml-2 text-amber-600">• Unsaved changes</span>
              )}
              {hasChanges && !lastSaved && (
                <span className="text-amber-600">Unsaved changes</span>
              )}
            </div>

            <Button
              onClick={saveEntry}
              disabled={saving || !hasChanges}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
