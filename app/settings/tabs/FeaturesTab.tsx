"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { AlertCircle, Grid3x3 } from "lucide-react"

interface MenuFeature {
  name: string
  label: string
  description: string
  url: string
  canBeDisabled: boolean
}

interface FeaturesTabProps {
  menuFeatures: MenuFeature[]
  featurePreferences: Record<string, boolean>
  loadingFeatures: boolean
  onToggleFeature: (featureName: string) => void
}

export function FeaturesTab({
  menuFeatures,
  featurePreferences,
  loadingFeatures,
  onToggleFeature,
}: FeaturesTabProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Grid3x3 className="h-5 w-5 text-blue-500" />
            Menu Features
          </CardTitle>
          <CardDescription>
            Enable or disable features to customize your navigation menu and available pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {menuFeatures.map((feature) => {
            const isEnabled = featurePreferences[feature.name] ?? true
            return (
              <div key={feature.name} className="flex items-start justify-between rounded-lg border p-4">
                <div className="pr-4 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{feature.label}</p>
                    {!feature.canBeDisabled && (
                      <Badge variant="secondary" className="text-xs">Required</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">URL: {feature.url}</p>
                </div>
                <div className="flex items-center gap-3">
                  {feature.canBeDisabled ? (
                    <>
                      <span className="text-sm font-medium text-muted-foreground">
                        {isEnabled ? "On" : "Off"}
                      </span>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => onToggleFeature(feature.name)}
                        disabled={loadingFeatures}
                      />
                    </>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">
                      Always On
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
        <CardFooter className="border-t bg-muted/60">
          <div className="flex w-full items-center text-sm text-muted-foreground">
            <AlertCircle className="mr-2 h-4 w-4" />
            <span>Disabled features will be hidden from the menu and their URLs will be inaccessible.</span>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
