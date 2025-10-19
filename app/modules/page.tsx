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
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
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
          setAllModules(data.modules || [])
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
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Modules</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <main className="flex-1 bg-slate-50">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-8">
              <div className="flex flex-col gap-3">
                <Badge className="w-fit text-sm font-medium">Extend your app functionality</Badge>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Modules</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Enable or disable installed modules to extend your app functionality.
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
                    Enable or disable installed modules to extend your app functionality.
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
                        No modules installed. Place modules in the <code className="px-1 py-0.5 bg-muted rounded text-xs">/modules</code> directory.
                      </p>
                    </div>
                  ) : (
                    allModules.map((module) => {
                      const Icon = getLucideIcon(module.icon)
                      const isEnabled = module.isEnabled

                      return (
                        <div key={module.id} className="flex items-start justify-between rounded-lg border p-4">
                          <div className="pr-4 flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Icon className="h-5 w-5 text-blue-600" />
                              <div>
                                <p className="text-sm font-medium">{module.name}</p>
                                <p className="text-xs text-muted-foreground">v{module.version} by {module.author}</p>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">{module.description}</p>
                            {module.routes && module.routes.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Routes: {module.routes.map(r => r.path).join(', ')}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground">
                              {isEnabled ? 'On' : 'Off'}
                            </span>
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={() => toggleModule(module.id, isEnabled)}
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
