"use client"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Palette, Sparkles } from "lucide-react"
import type { BetaFeatureSettings } from "../types"

interface GeneralTabProps {
  themePreference: string
  onThemeChange: (value: string) => void
  workspaceName: string
  onWorkspaceNameChange: (value: string) => void
  workspaceTagline: string
  onWorkspaceTaglineChange: (value: string) => void
  landingView: string
  onLandingViewChange: (value: string) => void
  betaFeatures: BetaFeatureSettings
  onBetaFeatureToggle: (key: keyof BetaFeatureSettings) => void
}

export function GeneralTab({
  themePreference,
  onThemeChange,
  workspaceName,
  onWorkspaceNameChange,
  workspaceTagline,
  onWorkspaceTaglineChange,
  landingView,
  onLandingViewChange,
  betaFeatures,
  onBetaFeatureToggle,
}: GeneralTabProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="h-5 w-5 text-purple-500" />
              Appearance
            </CardTitle>
            <CardDescription>
              Choose from four distinct themes to match your workflow and preference.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <RadioGroup
              value={themePreference}
              onValueChange={onThemeChange}
              className="grid gap-3"
            >
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="theme-pastel" className="text-base">Pastel Theme</Label>
                  <p className="text-sm text-muted-foreground">Soft pastel backgrounds for a gentle interface.</p>
                </div>
                <RadioGroupItem id="theme-pastel" value="pastel" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="theme-light" className="text-base">Light Theme</Label>
                  <p className="text-sm text-muted-foreground">Clean white/transparent backgrounds for minimal look.</p>
                </div>
                <RadioGroupItem id="theme-light" value="light" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="theme-blueprint" className="text-base">Blueprint Theme</Label>
                  <p className="text-sm text-muted-foreground">Professional blue theme for focused work.</p>
                </div>
                <RadioGroupItem id="theme-blueprint" value="blueprint" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="theme-dark" className="text-base">Dark Theme</Label>
                  <p className="text-sm text-muted-foreground">Reduce glare during late sessions.</p>
                </div>
                <RadioGroupItem id="theme-dark" value="dark" />
              </div>
            </RadioGroup>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">
                Appearance updates are instant and persist across all Ari surfaces.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-blue-500" />
              Workspace identity
            </CardTitle>
            <CardDescription>
              Fine tune your workspace branding and global defaults.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                value={workspaceName}
                onChange={(event) => onWorkspaceNameChange(event.target.value)}
                placeholder="Give your workspace a friendly name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-tagline">Tagline</Label>
              <Textarea
                id="workspace-tagline"
                value={workspaceTagline}
                onChange={(event) => onWorkspaceTaglineChange(event.target.value)}
                placeholder="Describe your team's mission"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Default landing view</Label>
              <Select value={landingView} onValueChange={onLandingViewChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose your home view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dashboard">Dashboard</SelectItem>
                  <SelectItem value="tasks">Tasks</SelectItem>
                  <SelectItem value="daily-fitness">Daily fitness</SelectItem>
                  <SelectItem value="assist">Assist</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Everyone in this workspace uses this view after sign-in.
              </p>
            </div>
          </CardContent>
          <CardFooter className="border-t bg-muted/60">
            <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
              <span>Brand updates go live instantly.</span>
              <Badge variant="secondary">Synced</Badge>
            </div>
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-rose-500" />
            Beta lab
          </CardTitle>
          <CardDescription>
            Experiment with upcoming intelligence features before general release.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between rounded-lg border p-4">
            <div className="pr-4">
              <p className="text-sm font-medium">Smart priorities</p>
              <p className="text-sm text-muted-foreground">AI reorders tasks based on urgency, dependencies, and team load.</p>
            </div>
            <Switch
              checked={betaFeatures.smartPriorities}
              onCheckedChange={() => onBetaFeatureToggle("smartPriorities")}
            />
          </div>
          <div className="flex items-start justify-between rounded-lg border p-4">
            <div className="pr-4">
              <p className="text-sm font-medium">Predictive scheduling</p>
              <p className="text-sm text-muted-foreground">Auto-distribute open tasks across the week with sprint-friendly pacing.</p>
            </div>
            <Switch
              checked={betaFeatures.predictiveScheduling}
              onCheckedChange={() => onBetaFeatureToggle("predictiveScheduling")}
            />
          </div>
          <div className="flex items-start justify-between rounded-lg border p-4">
            <div className="pr-4">
              <p className="text-sm font-medium">AI meeting notes</p>
              <p className="text-sm text-muted-foreground">Attach transcripts, highlights, and follow-ups to meeting records.</p>
            </div>
            <Switch
              checked={betaFeatures.aiMeetingNotes}
              onCheckedChange={() => onBetaFeatureToggle("aiMeetingNotes")}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
