"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { TaskAnnouncement } from "@/components/task-announcement"
import { getLucideIcon } from "@/lib/modules/icon-utils"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TopBar } from "@/components/top-bar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertCircle,
  Package,
} from "lucide-react"

export default function ModulesPage() {
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [allModules, setAllModules] = useState<any[]>([])
  const [modulesLoading, setModulesLoading] = useState(true)

  // Load all modules (not just enabled) for settings management
  useEffect(() => {
    async function loadAllModules() {
      try {
        setModulesLoading(true)
        // This endpoint needs to return ALL modules, not just enabled
        const response = await fetch('/api/modules/all')
        if (response.ok) {
          const data = await response.json()
          // Sort modules alphabetically by name
          const sortedModules = (data.modules || []).sort((a: any, b: any) =>
            a.name.localeCompare(b.name)
          )
          setAllModules(sortedModules)
        }
      } catch (error) {
        console.error('Error loading all modules:', error)
      } finally {
        setModulesLoading(false)
      }
    }
    loadAllModules()
  }, [])

  const toggleModule = async (moduleId: string, currentEnabled: boolean) => {
    const newEnabled = !currentEnabled

    try {
      const response = await fetch('/api/modules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moduleId,
          enabled: newEnabled
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update module')
      }

      // Refresh page to update module registry
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (error) {
      console.error('Error updating module:', error)
      setMessage({ type: 'error', text: 'Failed to update module. Please try again.' })
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TaskAnnouncement />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopBar>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Modules</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </TopBar>

          <main className="flex-1 bg-slate-50">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-8">
              <div className="flex flex-col gap-3">
                <Badge className="w-fit text-sm font-medium">Extend your app functionality</Badge>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Modules</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Enable or disable installed modules to extend your app functionality. <br /><span className="text-red-600">Note: Always assess third-party modules to ensure they are trustworthy and secure.</span>
                </p>
              </div>

              {message && (
                <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{message.text}</AlertDescription>
                </Alert>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Package className="h-5 w-5 text-purple-500" />
                    Modules
                  </CardTitle>
                  <CardDescription>
                    Toggle modules on or off below. Changes take effect after page refresh.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {modulesLoading ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">Loading modules...</p>
                    </div>
                  ) : allModules.length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                      <p className="text-sm text-muted-foreground">
                        No modules installed. Place custom modules in the <code className="px-1 py-0.5 bg-muted rounded text-xs">/modules-custom</code> directory.
                      </p>
                    </div>
                  ) : (
                    allModules.map((module) => {
                      const Icon = getLucideIcon(module.icon)
                      const isEnabled = module.isEnabled
                      const isCustomModule = module.path?.includes('/modules-custom/')
                      const isOverridden = module.isOverridden === true

                      // Determine badge color and text
                      let badgeColor = '#000000' // CORE MODULE (black)
                      let badgeText = 'CORE MODULE'
                      if (isOverridden) {
                        badgeColor = '#dc2626' // OVERRIDDEN (red)
                        badgeText = 'OVERRIDDEN'
                      } else if (isCustomModule) {
                        badgeColor = '#07be07' // USER MODULE (green)
                        badgeText = 'USER MODULE'
                      }

                      return (
                        <div key={`${module.id}-${module.path}`} className="flex items-start justify-between rounded-lg border p-4">
                          <div className="pr-4 flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Icon className="h-5 w-5 text-blue-600" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium">{module.name}</p>
                                  <Badge
                                    className="text-[10px] px-1.5 py-0 text-white"
                                    style={{ backgroundColor: badgeColor }}
                                  >
                                    {badgeText}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">v{module.version} by {module.author}</p>
                                <p className="text-xs text-muted-foreground">ID: {module.id}</p>
                                {module.routes && module.routes.length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Routes: {module.routes.map((r: any) => r.path).join(', ')}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">Path: /{isCustomModule ? 'modules-custom' : 'modules-core'}/{module.path?.split('/').pop()}</p>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">{module.description}</p>
                          </div>
                          <div className={`flex items-center gap-3 ${isOverridden ? 'opacity-30' : ''}`}>
                            <span className="text-sm font-medium text-muted-foreground">
                              {isEnabled ? 'On' : 'Off'}
                            </span>
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={() => toggleModule(module.id, isEnabled)}
                              disabled={isOverridden}
                            />
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
                <CardFooter className="border-t bg-muted/60">
                  <div className="flex w-full items-center text-sm text-muted-foreground">
                    <AlertCircle className="mr-2 h-4 w-4" />
                    <span>Disabled modules won't appear in navigation. Toggling requires page refresh.</span>
                  </div>
                </CardFooter>
              </Card>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
