'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Save, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useProspectSettings, useUpdateProspectSettings } from '../../hooks/use-my-prospects'
import type { ProspectSettings } from '../../types'

const DEFAULT_SETTINGS: ProspectSettings = {
  showInDashboard: true,
}

export default function MyProspectsSettingsPage() {
  const { toast } = useToast()
  const { data: savedSettings, isLoading } = useProspectSettings()
  const updateSettings = useUpdateProspectSettings()

  const [settings, setSettings] = useState<ProspectSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (savedSettings) {
      setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
    }
  }, [savedSettings])

  useEffect(() => {
    return () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current) }
  }, [])

  const handleSave = () => {
    setSaved(false)
    updateSettings.mutate(settings, {
      onSuccess: () => {
        setSaved(true)
        savedTimerRef.current = setTimeout(() => setSaved(false), 3000)
      },
      onError: () => {
        toast({ variant: 'destructive', title: 'Failed to save settings' })
      },
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-4xl font-medium">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your My Prospects module</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Module Settings</CardTitle>
          <CardDescription>Customize how My Prospects works for you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show in Dashboard</Label>
              <div className="text-sm text-muted-foreground">
                Display prospect stats on the main dashboard
              </div>
            </div>
            <Switch
              checked={settings.showInDashboard}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, showInDashboard: checked }))
              }
            />
          </div>

          <div className="flex items-center gap-2 pt-4 border-t">
            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
