"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Plug } from "lucide-react"

export function IntegrationsTab(): React.ReactElement {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plug className="h-5 w-5 text-indigo-500" />
            Connected apps
          </CardTitle>
          <CardDescription>
            Manage the tools that sync data into Ari.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Supabase</p>
                <p className="text-xs text-muted-foreground">Realtime tasks & auth</p>
              </div>
              <Badge variant="secondary">Connected</Badge>
            </div>
            <Separator className="my-4" />
            <p className="text-sm text-muted-foreground">
              Syncs tasks, fitness logs, and motivation content via secured service role.
            </p>
            <Button variant="outline" size="sm" className="mt-4 w-full">
              Manage keys
            </Button>
          </div>
          <div className="rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Notion</p>
                <p className="text-xs text-muted-foreground">Docs & rituals</p>
              </div>
              <Badge variant="outline">Available</Badge>
            </div>
            <Separator className="my-4" />
            <p className="text-sm text-muted-foreground">
              Mirror rituals, handbooks, and SOPs directly into Ari dashboards.
            </p>
            <Button size="sm" className="mt-4 w-full">
              Connect
            </Button>
          </div>
          <div className="rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Linear</p>
                <p className="text-xs text-muted-foreground">Engineering backlog</p>
              </div>
              <Badge variant="outline">Available</Badge>
            </div>
            <Separator className="my-4" />
            <p className="text-sm text-muted-foreground">
              Auto-link shipped tickets to Ari milestones with status mirroring.
            </p>
            <Button size="sm" className="mt-4 w-full">
              Connect
            </Button>
          </div>
          <div className="rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Slack</p>
                <p className="text-xs text-muted-foreground">Channel digests</p>
              </div>
              <Badge variant="outline">Available</Badge>
            </div>
            <Separator className="my-4" />
            <p className="text-sm text-muted-foreground">
              Send curated notifications into team channels with context-aware summaries.
            </p>
            <Button size="sm" className="mt-4 w-full">
              Connect
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Automation recipes</CardTitle>
          <CardDescription>
            Kick-start automation with prebuilt flows. Toggle to activate instantly.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col justify-between rounded-xl border p-5">
            <div>
              <p className="text-sm font-medium">Quiet hours</p>
              <p className="mt-2 text-sm text-muted-foreground">Mute notifications nightly and resurface blockers each morning.</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Badge variant="outline">Recommended</Badge>
              <Switch defaultChecked />
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-xl border p-5">
            <div>
              <p className="text-sm font-medium">Post-meeting recap</p>
              <p className="mt-2 text-sm text-muted-foreground">Collect action items after calendar events tagged "Ari".</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Badge variant="secondary">Active</Badge>
              <Switch defaultChecked />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
