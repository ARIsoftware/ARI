"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { UserProfile } from "@clerk/nextjs"
import { DM_Sans } from "next/font/google"
import { AppSidebar } from "../../components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  Settings, 
  User, 
  Loader2, 
  Palette, 
  Shield, 
  Download, 
  Trash2, 
  Monitor, 
  List, 
  Grid3X3,
  Moon,
  Sun,
  Laptop
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

// Custom Icons for UserProfile pages
const PreferencesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.205 1.251l-1.18 2.044a1 1 0 01-1.186.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.205-1.251l1.18-2.044a1 1 0 011.186-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
  </svg>
)

const PrivacyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <path fillRule="evenodd" d="M10 1L5 4v5.5c0 3.5 2.36 6.82 5 7.5 2.64-.68 5-4 5-7.5V4l-5-3zM8 10a2 2 0 114 0v1h1a1 1 0 011 1v3a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1h1v-1z" clipRule="evenodd" />
  </svg>
)

// App Preferences Custom Component
const AppPreferencesPage = () => {
  const { toast } = useToast()
  const [preferences, setPreferences] = useState({
    defaultViewMode: 'list',
    theme: 'light',
    notificationsEnabled: true,
    autoRefresh: true,
    compactMode: false
  })

  const handlePreferenceChange = (key: string, value: any) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }))
    
    // Save to localStorage or send to API
    localStorage.setItem('ari-preferences', JSON.stringify({
      ...preferences,
      [key]: value
    }))
    
    toast({
      title: "Preferences Updated",
      description: "Your preferences have been saved successfully.",
    })
  }

  useEffect(() => {
    // Load preferences from localStorage
    const saved = localStorage.getItem('ari-preferences')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setPreferences(parsed)
      } catch (e) {
        console.error('Failed to parse saved preferences')
      }
    }
  }, [])

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">App Preferences</h2>
        <p className="text-gray-600 mt-1">Customize your ARI experience</p>
      </div>

      <div className="space-y-6">
        {/* View Mode */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Monitor className="w-5 h-5" />
              Default View Mode
            </CardTitle>
            <CardDescription>Choose your preferred view for tasks and exercises</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button
                variant={preferences.defaultViewMode === 'list' ? 'default' : 'outline'}
                onClick={() => handlePreferenceChange('defaultViewMode', 'list')}
                className="flex items-center gap-2"
              >
                <List className="w-4 h-4" />
                List View
              </Button>
              <Button
                variant={preferences.defaultViewMode === 'card' ? 'default' : 'outline'}
                onClick={() => handlePreferenceChange('defaultViewMode', 'card')}
                className="flex items-center gap-2"
              >
                <Grid3X3 className="w-4 h-4" />
                Card View
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Theme */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="w-5 h-5" />
              Theme
            </CardTitle>
            <CardDescription>Choose your app appearance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button
                variant={preferences.theme === 'light' ? 'default' : 'outline'}
                onClick={() => handlePreferenceChange('theme', 'light')}
                className="flex items-center gap-2"
              >
                <Sun className="w-4 h-4" />
                Light
              </Button>
              <Button
                variant={preferences.theme === 'dark' ? 'default' : 'outline'}
                onClick={() => handlePreferenceChange('theme', 'dark')}
                className="flex items-center gap-2"
              >
                <Moon className="w-4 h-4" />
                Dark
              </Button>
              <Button
                variant={preferences.theme === 'system' ? 'default' : 'outline'}
                onClick={() => handlePreferenceChange('theme', 'system')}
                className="flex items-center gap-2"
              >
                <Laptop className="w-4 h-4" />
                System
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Other Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Settings</CardTitle>
            <CardDescription>Fine-tune your app experience</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable Notifications</p>
                <p className="text-sm text-gray-500">Get notified about task updates</p>
              </div>
              <Button
                variant={preferences.notificationsEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => handlePreferenceChange('notificationsEnabled', !preferences.notificationsEnabled)}
              >
                {preferences.notificationsEnabled ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Auto Refresh</p>
                <p className="text-sm text-gray-500">Automatically refresh data</p>
              </div>
              <Button
                variant={preferences.autoRefresh ? "default" : "outline"}
                size="sm"
                onClick={() => handlePreferenceChange('autoRefresh', !preferences.autoRefresh)}
              >
                {preferences.autoRefresh ? 'Enabled' : 'Disabled'}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Compact Mode</p>
                <p className="text-sm text-gray-500">Use less spacing in interface</p>
              </div>
              <Button
                variant={preferences.compactMode ? "default" : "outline"}
                size="sm"
                onClick={() => handlePreferenceChange('compactMode', !preferences.compactMode)}
              >
                {preferences.compactMode ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Data & Privacy Custom Component
const DataPrivacyPage = () => {
  const { user } = useUser()
  const { toast } = useToast()
  const [isExporting, setIsExporting] = useState(false)

  const handleExportData = async () => {
    setIsExporting(true)
    try {
      // Simulate data export
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // In a real app, you'd call your API to generate and download data
      const data = {
        user: {
          email: user?.emailAddresses[0]?.emailAddress,
          firstName: user?.firstName,
          lastName: user?.lastName,
          createdAt: user?.createdAt
        },
        exportedAt: new Date().toISOString(),
        // Add your app's data here
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ari-data-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast({
        title: "Data Exported",
        description: "Your data has been exported successfully.",
      })
    } catch (error) {
      toast({
        title: "Export Failed", 
        description: "There was an error exporting your data.",
        variant: "destructive"
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Data & Privacy</h2>
        <p className="text-gray-600 mt-1">Manage your data and privacy settings</p>
      </div>

      <div className="space-y-6">
        {/* Data Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download className="w-5 h-5" />
              Export Your Data
            </CardTitle>
            <CardDescription>Download a copy of all your data stored in ARI</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                This will include your tasks, fitness exercises, preferences, and account information. 
                The export will be provided as a JSON file.
              </p>
              <Button 
                onClick={handleExportData}
                disabled={isExporting}
                className="flex items-center gap-2"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export Data
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Privacy Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="w-5 h-5" />
              Privacy Settings
            </CardTitle>
            <CardDescription>Control how your data is used</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Analytics</p>
                <p className="text-sm text-gray-500">Help improve ARI with anonymous usage data</p>
              </div>
              <Button variant="outline" size="sm">
                Manage
              </Button>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Data Retention</p>
                <p className="text-sm text-gray-500">Control how long your data is stored</p>
              </div>
              <Button variant="outline" size="sm">
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-red-600">
              <Trash2 className="w-5 h-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
                <div>
                  <p className="font-medium text-red-800">Delete Account</p>
                  <p className="text-sm text-red-600">Permanently delete your account and all data</p>
                </div>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => {
                    toast({
                      title: "Account Deletion",
                      description: "Please contact support to delete your account.",
                    })
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser()

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <div className="h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
          <span className={`text-white font-medium ${dmSans.className}`}>ARI</span>
        </div>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <div className="flex items-center justify-center h-96">
              <div className="flex items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Loading settings...</span>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
        <span className={`text-white font-medium ${dmSans.className}`}>ARI</span>
      </div>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">People</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-lg">
                  <Settings className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Settings</h1>
                  {user && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Manage your account settings and preferences
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Custom UserProfile with Custom Pages */}
            <Card className="w-full">
              <CardContent className="p-0">
                <div className="flex justify-center">
                  <UserProfile
                    appearance={{
                      elements: {
                        rootBox: "w-full",
                        card: "shadow-none border-0 w-full",
                        navbar: "border-b border-gray-200",
                        navbarMobileMenuButton: "lg:hidden",
                        headerTitle: "hidden",
                        headerSubtitle: "hidden",
                        socialButtonsBlockButton: "border border-gray-300 hover:bg-gray-50",
                        formButtonPrimary: "bg-black hover:bg-gray-800 text-white",
                        footerActionLink: "text-black hover:text-gray-700",
                        profileSectionPrimaryButton: "bg-black hover:bg-gray-800 text-white",
                        profileSectionTitleText: "text-lg font-semibold text-gray-900",
                        profileSectionContentText: "text-sm text-gray-600",
                        accordionTriggerButton: "hover:bg-gray-50 text-gray-900",
                        menuButton: "hover:bg-gray-50 text-gray-900",
                        menuList: "border border-gray-200 shadow-lg",
                        menuItem: "hover:bg-gray-50 text-gray-900",
                        dividerLine: "bg-gray-200",
                        profilePage: "bg-white",
                        profileSection: "border-b border-gray-100 last:border-b-0",
                        badge: "bg-gray-100 text-gray-800",
                        alertText: "text-red-600",
                        formFieldLabel: "text-sm font-medium text-gray-700",
                        formFieldInput: "border-gray-300 focus:border-black focus:ring-black",
                        identityPreviewText: "text-gray-900",
                        identityPreviewEditButton: "text-black hover:text-gray-700",
                        navbarButton: "text-gray-600 hover:text-gray-900",
                        navbarButtonIcon: "text-gray-500",
                      },
                      layout: {
                        socialButtonsPlacement: "bottom",
                        socialButtonsVariant: "blockButton",
                      },
                    }}
                    routing="path"
                    path="/settings"
                  >
                    {/* App Preferences Custom Page */}
                    <UserProfile.Page 
                      label="App Preferences" 
                      labelIcon={<PreferencesIcon />} 
                      url="preferences"
                    >
                      <AppPreferencesPage />
                    </UserProfile.Page>

                    {/* Data & Privacy Custom Page */}
                    <UserProfile.Page 
                      label="Data & Privacy" 
                      labelIcon={<PrivacyIcon />} 
                      url="privacy"
                    >
                      <DataPrivacyPage />
                    </UserProfile.Page>
                  </UserProfile>
                </div>
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}