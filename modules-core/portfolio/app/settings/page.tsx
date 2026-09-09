/**
 * Portfolio Module - Settings Page
 *
 * Route: /portfolio/settings
 */

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { usePortfolioSettings, useUpdatePortfolioSettings } from '../../hooks/use-portfolio'

export default function PortfolioSettingsPage() {
  const { toast } = useToast()
  const { data: settings, isLoading } = usePortfolioSettings()
  const updateSettings = useUpdatePortfolioSettings()

  const [showDashboardWidget, setShowDashboardWidget] = useState(true)

  useEffect(() => {
    if (settings) {
      setShowDashboardWidget(settings.showDashboardWidget ?? true)
    }
  }, [settings])

  const handleToggleHoldings = (checked: boolean) => {
    setShowDashboardWidget(checked)
    updateSettings.mutate(
      { showDashboardWidget: checked },
      {
        onError: (err) => {
          setShowDashboardWidget(!checked)
          toast({
            variant: 'destructive',
            title: 'Failed to save setting',
            description: err instanceof Error ? err.message : 'Please try again',
          })
        },
      },
    )
  }

  const handleResetOnboarding = () => {
    updateSettings.mutate(
      { onboardingCompleted: false },
      {
        onSuccess: () => {
          toast({
            title: 'Onboarding reset',
            description: 'You will see the setup screen the next time you open Portfolio.',
          })
        },
        onError: (err) => {
          toast({
            variant: 'destructive',
            title: 'Failed to reset onboarding',
            description: err instanceof Error ? err.message : 'Please try again',
          })
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96" role="status">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading settings…</span>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-4xl font-medium">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your Portfolio module</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dashboard Cards</CardTitle>
          <CardDescription>Choose how Portfolio appears on the main dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="show-holdings-card" className="text-base">
                Holdings Card
              </Label>
              <p className="text-sm text-muted-foreground">
                Display a compact list of your tickers and live prices on the dashboard. The widget
                is only shown when you have at least one ticker.
              </p>
            </div>
            <Switch
              id="show-holdings-card"
              checked={showDashboardWidget}
              onCheckedChange={handleToggleHoldings}
              disabled={updateSettings.isPending}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding</CardTitle>
          <CardDescription>
            Reset the setup flow if you want to walk through it again
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handleResetOnboarding}
            disabled={updateSettings.isPending}
          >
            Reset onboarding
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
