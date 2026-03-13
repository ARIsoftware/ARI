"use client"

import { useEffect, useState } from "react"
import { Activity, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { useExerciseReminderSettings, useUpdateExerciseReminderSettings } from "@/modules/exercise-reminder/hooks/use-exercise-reminder"
import { DEFAULT_SETTINGS } from "@/modules/exercise-reminder/types"

export default function ExerciseReminderPage() {
  const { toast } = useToast()
  const { data: savedSettings, isLoading } = useExerciseReminderSettings()
  const updateSettings = useUpdateExerciseReminderSettings()

  const enabled = savedSettings?.enabled ?? DEFAULT_SETTINGS.enabled
  const dismissable = savedSettings?.dismissable ?? DEFAULT_SETTINGS.dismissable

  const [messageInput, setMessageInput] = useState('')
  const [triggerMinuteInput, setTriggerMinuteInput] = useState('')
  const [countdownInput, setCountdownInput] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Sync local input state from server data
  useEffect(() => {
    if (savedSettings !== undefined) {
      setMessageInput(savedSettings?.message ?? DEFAULT_SETTINGS.message)
      setTriggerMinuteInput(String(savedSettings?.triggerMinute ?? DEFAULT_SETTINGS.triggerMinute))
      setCountdownInput(String(savedSettings?.countdownDuration ?? DEFAULT_SETTINGS.countdownDuration))
    }
  }, [savedSettings])

  const handleToggle = (field: 'enabled' | 'dismissable', value: boolean) => {
    updateSettings.mutate({ [field]: value }, {
      onError: (err) => toast({ variant: 'destructive', title: 'Failed to save', description: err.message }),
    })
  }

  const handleSave = (field: string, value: string | number) => {
    const fieldErrors: Record<string, string> = {}

    if (field === 'message' && typeof value === 'string') {
      if (!value.trim()) fieldErrors.message = 'Message cannot be empty'
      if (value.length > 200) fieldErrors.message = 'Message must be 200 characters or less'
    }
    if (field === 'countdownDuration' && typeof value === 'number') {
      if (!Number.isInteger(value) || value < 2 || value > 30) {
        fieldErrors.countdownDuration = 'Must be a whole number between 2 and 30'
      }
    }
    if (field === 'triggerMinute' && typeof value === 'number') {
      if (!Number.isInteger(value) || value < 0 || value > 59) {
        fieldErrors.triggerMinute = 'Must be a whole number between 0 and 59'
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...fieldErrors }))
      return
    }

    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })

    updateSettings.mutate({ [field]: value }, {
      onError: (err) => toast({ variant: 'destructive', title: 'Failed to save', description: err.message }),
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Exercise Reminder</h1>
          <p className="text-sm text-muted-foreground">Configure your hourly exercise break reminder</p>
        </div>
      </div>

      {/* Enabled Toggle */}
      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="font-medium">Enabled</p>
            <p className="text-sm text-muted-foreground">Show exercise reminder popups</p>
          </div>
          <Switch checked={enabled} onCheckedChange={(val) => handleToggle('enabled', val)} />
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Settings</CardTitle>
          <CardDescription>Customize your reminder</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Input
              id="message"
              value={messageInput}
              onChange={(e) => {
                setMessageInput(e.target.value)
                if (errors.message) setErrors((prev) => { const next = { ...prev }; delete next.message; return next })
              }}
              className={errors.message ? 'border-red-500 focus-visible:ring-red-500' : ''}
              onBlur={() => {
                const serverMessage = savedSettings?.message ?? DEFAULT_SETTINGS.message
                if (messageInput !== serverMessage) handleSave('message', messageInput)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave('message', messageInput)
              }}
            />
            {errors.message && <p className="text-xs text-red-500">{errors.message}</p>}
          </div>

          {/* Trigger Minute */}
          <div className="space-y-2">
            <Label htmlFor="triggerMinute">Trigger Minute</Label>
            <p className="text-sm text-muted-foreground">Minute past each hour when the reminder appears (0–59)</p>
            <Input
              id="triggerMinute"
              type="number"
              min={0}
              max={59}
              value={triggerMinuteInput}
              onChange={(e) => {
                setTriggerMinuteInput(e.target.value)
                if (errors.triggerMinute) setErrors((prev) => { const next = { ...prev }; delete next.triggerMinute; return next })
              }}
              className={`w-24 ${errors.triggerMinute ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              onBlur={() => {
                const val = parseInt(triggerMinuteInput, 10)
                const serverVal = savedSettings?.triggerMinute ?? DEFAULT_SETTINGS.triggerMinute
                if (val !== serverVal) handleSave('triggerMinute', val)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave('triggerMinute', parseInt(triggerMinuteInput, 10))
              }}
            />
            {errors.triggerMinute && <p className="text-xs text-red-500">{errors.triggerMinute}</p>}
          </div>

          {/* Countdown Duration */}
          <div className="space-y-2">
            <Label htmlFor="countdownDuration">Countdown Duration (minutes)</Label>
            <p className="text-sm text-muted-foreground">How long before the DONE button activates (2–30)</p>
            <Input
              id="countdownDuration"
              type="number"
              min={2}
              max={30}
              value={countdownInput}
              onChange={(e) => {
                setCountdownInput(e.target.value)
                if (errors.countdownDuration) setErrors((prev) => { const next = { ...prev }; delete next.countdownDuration; return next })
              }}
              className={`w-24 ${errors.countdownDuration ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              onBlur={() => {
                const val = parseInt(countdownInput, 10)
                const serverVal = savedSettings?.countdownDuration ?? DEFAULT_SETTINGS.countdownDuration
                if (val !== serverVal) handleSave('countdownDuration', val)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave('countdownDuration', parseInt(countdownInput, 10))
              }}
            />
            {errors.countdownDuration && <p className="text-xs text-red-500">{errors.countdownDuration}</p>}
          </div>

          {/* Dismissable */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Dismissable</p>
              <p className="text-sm text-muted-foreground">Allow dismissing the popup without waiting for the countdown</p>
            </div>
            <Switch checked={dismissable} onCheckedChange={(val) => handleToggle('dismissable', val)} />
          </div>
        </CardContent>
      </Card>

      {/* Test Button */}
      <Card>
        <CardContent className="pt-6">
          <Button
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).testExerciseReminder) {
                (window as any).testExerciseReminder()
              }
            }}
            variant="outline"
            className="w-full"
          >
            <Activity className="w-4 h-4 mr-2" />
            Test Reminder
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Triggers the reminder popup immediately to preview your settings
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
