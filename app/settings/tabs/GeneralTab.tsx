"use client"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Palette, Sparkles } from "lucide-react"
import { WorkspaceIdentitySection } from "./WorkspaceIdentitySection"

interface GeneralTabProps {
  themePreference: string
  onThemeChange: (value: string) => void
  workspaceName: string
  onWorkspaceNameChange: (value: string) => void
  workspaceTagline: string
  onWorkspaceTaglineChange: (value: string) => void
  landingView: string
  onLandingViewChange: (value: string) => void
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
}: GeneralTabProps): React.ReactElement {
  return (
    <div className="space-y-6">
      {/* User Profile Section */}
      <WorkspaceIdentitySection />

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
                  <p className="text-sm text-muted-foreground">Warm cream and peach tones for a gentle interface.</p>
                </div>
                <RadioGroupItem id="theme-pastel" value="pastel" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="theme-light" className="text-base">Light Theme</Label>
                  <p className="text-sm text-muted-foreground">Clean white with cool blue accents.</p>
                </div>
                <RadioGroupItem id="theme-light" value="light" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="theme-blueprint" className="text-base">Blueprint Theme</Label>
                  <p className="text-sm text-muted-foreground">Professional deep blue for focused work.</p>
                </div>
                <RadioGroupItem id="theme-blueprint" value="blueprint" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="theme-dark" className="text-base">Dark Theme</Label>
                  <p className="text-sm text-muted-foreground">OLED black with emerald green accents.</p>
                </div>
                <RadioGroupItem id="theme-dark" value="dark" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="theme-terminal" className="text-base">Terminal Theme</Label>
                  <p className="text-sm text-muted-foreground">Retro mainframe aesthetic with phosphor green.</p>
                </div>
                <RadioGroupItem id="theme-terminal" value="terminal" />
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

    </div>
  )
}
