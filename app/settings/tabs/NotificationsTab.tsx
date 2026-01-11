"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bell } from "lucide-react"
import type { NotificationSettings } from "../types"

interface NotificationsTabProps {
  notificationSettings: NotificationSettings
  pushNotifications: boolean
  onToggleNotification: (key: keyof NotificationSettings) => void
  onPushNotificationsChange: (value: boolean) => void
}

export function NotificationsTab({
  notificationSettings,
  pushNotifications,
  onToggleNotification,
  onPushNotificationsChange,
}: NotificationsTabProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5 text-blue-500" />
              Email alerts
            </CardTitle>
            <CardDescription>
              Decide which summaries and nudges land in your inbox.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between rounded-lg border p-4">
              <div className="pr-4">
                <p className="text-sm font-medium">Task reminders</p>
                <p className="text-sm text-muted-foreground">Deadline nudges and follow-up prompts.</p>
              </div>
              <Switch
                checked={notificationSettings.taskReminders}
                onCheckedChange={() => onToggleNotification("taskReminders")}
              />
            </div>
            <div className="flex items-start justify-between rounded-lg border p-4">
              <div className="pr-4">
                <p className="text-sm font-medium">Product updates</p>
                <p className="text-sm text-muted-foreground">Release highlights, tips, and changelog notes.</p>
              </div>
              <Switch
                checked={notificationSettings.productUpdates}
                onCheckedChange={() => onToggleNotification("productUpdates")}
              />
            </div>
            <div className="flex items-start justify-between rounded-lg border p-4">
              <div className="pr-4">
                <p className="text-sm font-medium">Security alerts</p>
                <p className="text-sm text-muted-foreground">New device sign-ins and policy changes.</p>
              </div>
              <Switch
                checked={notificationSettings.securityAlerts}
                onCheckedChange={() => onToggleNotification("securityAlerts")}
              />
            </div>
            <div className="flex items-start justify-between rounded-lg border p-4">
              <div className="pr-4">
                <p className="text-sm font-medium">Weekly summary</p>
                <p className="text-sm text-muted-foreground">Digest of accomplishments, blockers, and fitness wins.</p>
              </div>
              <Switch
                checked={notificationSettings.weeklySummary}
                onCheckedChange={() => onToggleNotification("weeklySummary")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5 text-purple-500" />
              Push & in-app
            </CardTitle>
            <CardDescription>
              Quick nudges when you are active in Ari or on mobile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start justify-between rounded-lg border p-4">
              <div className="pr-4">
                <p className="text-sm font-medium">Push notifications</p>
                <p className="text-sm text-muted-foreground">Mirrors urgent alerts to your paired devices.</p>
              </div>
              <Switch
                checked={pushNotifications}
                onCheckedChange={onPushNotificationsChange}
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="digest-day">Weekly digest day</Label>
              <Select defaultValue="friday">
                <SelectTrigger id="digest-day">
                  <SelectValue placeholder="Choose weekday" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">Monday</SelectItem>
                  <SelectItem value="wednesday">Wednesday</SelectItem>
                  <SelectItem value="friday">Friday</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Digest arrives at 8AM in your timezone with highlights, trends, and focus recs.
              </p>
            </div>
            <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              Mute mode detected? Ari pauses push alerts automatically when Focus Timer is active.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
