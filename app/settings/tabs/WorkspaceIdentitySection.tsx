"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { User, Info, Loader2, Save, Check } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// Common timezones for the dropdown
const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'America/Vancouver', label: 'Vancouver' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Jerusalem', label: 'Jerusalem' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Australia/Melbourne', label: 'Melbourne' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg' },
]

interface UserPreferencesData {
  name: string
  email: string
  title: string
  company_name: string
  country: string
  city: string
  linkedin_url: string
  timezone: string
}

export function WorkspaceIdentitySection(): React.ReactElement {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof UserPreferencesData, string>>>({})
  const [formData, setFormData] = useState<UserPreferencesData>({
    name: '',
    email: '',
    title: '',
    company_name: '',
    country: '',
    city: '',
    linkedin_url: '',
    timezone: 'UTC',
  })
  const [originalData, setOriginalData] = useState<UserPreferencesData | null>(null)

  useEffect(() => {
    async function loadPreferences() {
      try {
        const response = await fetch('/api/user-preferences')
        if (response.ok) {
          const data = await response.json()
          const prefs = {
            name: data.name || '',
            email: data.email || '',
            title: data.title || '',
            company_name: data.company_name || '',
            country: data.country || '',
            city: data.city || '',
            linkedin_url: data.linkedin_url || '',
            timezone: data.timezone || 'UTC',
          }

          // If DB returned empty data, check localStorage for unsaved welcome profile
          const isEmpty = !prefs.name && !prefs.title && !prefs.company_name && !prefs.country && !prefs.city && !prefs.linkedin_url
          if (isEmpty) {
            try {
              const stored = localStorage.getItem('ari_welcome_profile')
              if (stored) {
                const welcomeData = JSON.parse(stored)
                const merged = {
                  name: welcomeData.name || prefs.name,
                  email: welcomeData.email || prefs.email,
                  title: welcomeData.title || prefs.title,
                  company_name: welcomeData.company_name || prefs.company_name,
                  country: welcomeData.country || prefs.country,
                  city: welcomeData.city || prefs.city,
                  linkedin_url: welcomeData.linkedin_url || prefs.linkedin_url,
                  timezone: welcomeData.timezone || prefs.timezone,
                }
                setFormData(merged)
                setOriginalData(merged)

                // Sync to DB and clear localStorage
                fetch('/api/user-preferences', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: stored,
                }).then(res => {
                  if (res.ok) localStorage.removeItem('ari_welcome_profile')
                }).catch((err) => console.warn('Failed to sync welcome profile to DB:', err))

                return
              }
            } catch {}
          }

          setFormData(prefs)
          setOriginalData(prefs)
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadPreferences()
  }, [])

  useEffect(() => {
    if (originalData) {
      const changed = JSON.stringify(formData) !== JSON.stringify(originalData)
      setHasChanges(changed)
    }
  }, [formData, originalData])

  const handleChange = (field: keyof UserPreferencesData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error for field when user edits it
    if (fieldErrors[field]) {
      setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next })
    }
  }

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof UserPreferencesData, string>> = {}
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address'
    }
    if (formData.linkedin_url && !formData.linkedin_url.startsWith('http')) {
      errors.linkedin_url = 'Please enter a valid URL starting with https://'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return

    setIsSaving(true)
    try {
      const response = await fetch('/api/user-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name || null,
          email: formData.email || null,
          title: formData.title || null,
          company_name: formData.company_name || null,
          country: formData.country || null,
          city: formData.city || null,
          linkedin_url: formData.linkedin_url || null,
          timezone: formData.timezone,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to save preferences')
      }

      setOriginalData(formData)
      setHasChanges(false)
      toast({
        title: 'Preferences saved',
        description: 'Your profile information has been updated.',
      })
    } catch (error) {
      console.error('Failed to save preferences:', error)
      toast({
        variant: 'destructive',
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'There was an error saving your preferences.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-indigo-500" />
            Your Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-indigo-500" />
            Your Profile
          </CardTitle>
          <CardDescription>
            Personal information stored securely in your database. Used for scheduling features like automatic backups.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="your@email.com"
                className={fieldErrors.email ? 'border-red-500 focus-visible:ring-red-500' : ''}
              />
              {fieldErrors.email && <p className="text-sm text-red-500">{fieldErrors.email}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-title">Title</Label>
            <Input
              id="profile-title"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Your job title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-company">Company Name</Label>
            <Input
              id="profile-company"
              value={formData.company_name}
              onChange={(e) => handleChange('company_name', e.target.value)}
              placeholder="Your company name"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-country">Country</Label>
              <Input
                id="profile-country"
                value={formData.country}
                onChange={(e) => handleChange('country', e.target.value)}
                placeholder="Your country"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-city">City</Label>
              <Input
                id="profile-city"
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
                placeholder="Your city"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-linkedin">LinkedIn URL</Label>
            <Input
              id="profile-linkedin"
              value={formData.linkedin_url}
              onChange={(e) => handleChange('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/in/yourprofile"
              className={fieldErrors.linkedin_url ? 'border-red-500 focus-visible:ring-red-500' : ''}
            />
            {fieldErrors.linkedin_url && <p className="text-sm text-red-500">{fieldErrors.linkedin_url}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="profile-timezone">Timezone</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-xs">Your timezone is used for scheduling features like automatic backups.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={formData.timezone}
              onValueChange={(value) => handleChange('timezone', value)}
            >
              <SelectTrigger id="profile-timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter className="pt-6 border-t bg-muted/60 flex justify-between">
          <div className="flex items-center text-sm text-muted-foreground">
            {hasChanges ? (
              <span className="text-amber-600">Unsaved changes</span>
            ) : (
              <span className="flex items-center gap-1">
                <Check className="h-4 w-4 text-green-500" />
                Saved
              </span>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            size="sm"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </TooltipProvider>
  )
}
