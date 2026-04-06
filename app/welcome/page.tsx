"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertCircle,
  Save,
  Info,
  ExternalLink,
  CheckCircle,
  Shield,
  Check,
  X,
  ArrowRight,
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StepIndicator } from "./components/step-indicator"
import { CodeBlock } from "./components/code-block"

// Common timezones (shared with settings page)
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

interface OnboardingData {
  // GitHub (tracking)
  githubSetupComplete: boolean
  // GitHub Sync (optional)
  githubToken: string
  githubRepoOwner: string
  githubRepoName: string
  // Supabase (required)
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseSecretKey: string
  databaseUrl: string
  // Better Auth (required)
  betterAuthSecret: string
  // Admin Account (optional first-run bootstrap)
  adminEmail: string
  adminPassword: string
  // Resend (optional)
  resendApiKey: string
  resendWebhookSecret: string
  // Vercel (tracking)
  vercelSetupComplete: boolean
}

// Generate a cryptographically secure random string for BETTER_AUTH_SECRET
const generateAuthSecret = () => {
  const array = new Uint8Array(32)
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array)
  }
  return btoa(String.fromCharCode(...array))
}

const STEP_ORDER = ["personal", "account", "supabase", "resend", "github", "vercel", "download"]

export default function WelcomePage() {
  const [completedLines, setCompletedLines] = useState<string[]>([])
  const [currentLineText, setCurrentLineText] = useState("")
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const [isTyping, setIsTyping] = useState(false)
  const [showContinue, setShowContinue] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const [currentTab, setCurrentTab] = useState("personal")
  const [selectedOS, setSelectedOS] = useState<"mac" | "windows" | "linux" | null>(null)

  const [formData, setFormData] = useState<OnboardingData>({
    githubSetupComplete: false,
    githubToken: "",
    githubRepoOwner: "",
    githubRepoName: "",
    supabaseUrl: "",
    supabaseAnonKey: "",
    supabaseSecretKey: "",
    databaseUrl: "",
    betterAuthSecret: "",
    adminEmail: "",
    adminPassword: "",
    resendApiKey: "",
    resendWebhookSecret: "",
    vercelSetupComplete: false,
  })

  // Personal profile state (matches /settings profile fields)
  const [profileData, setProfileData] = useState({
    name: '',
    email: '',
    title: '',
    company_name: '',
    country: '',
    city: '',
    linkedin_url: '',
    timezone: 'UTC',
  })
  const [profileSaved, setProfileSaved] = useState(false)
  const [adminConfirmPassword, setAdminConfirmPassword] = useState("")
  const [adminPasswordError, setAdminPasswordError] = useState("")

  // Rehydrate the post-save state across the Fast Refresh reload that fires
  // when /api/download-env writes .env.local. Without this the React state
  // resets and the user lands back on step 1 with no idea what happened.
  useEffect(() => {
    if (localStorage.getItem('ari:welcome:saved') === '1') {
      setEnvSaveStatus('saved')
      setCurrentTab('download')
      setShowOnboarding(true)
    }
  }, [])

  // Prefill profile from DB if available, then overlay with any localStorage edits
  useEffect(() => {
    async function loadProfile() {
      let dbData: Record<string, string> | null = null
      try {
        const res = await fetch('/api/user-preferences')
        if (res.ok) {
          dbData = await res.json()
        }
      } catch {}

      // Check localStorage for in-progress edits (expires after 24 hours)
      let localData: Record<string, string> | null = null
      try {
        const stored = localStorage.getItem('ari_welcome_profile')
        if (stored) {
          const parsed = JSON.parse(stored)
          const age = Date.now() - (parsed._savedAt || 0)
          if (age < 24 * 60 * 60 * 1000) {
            localData = parsed
          } else {
            localStorage.removeItem('ari_welcome_profile')
          }
        }
      } catch {}

      // Merge: localStorage edits take priority over DB data
      const merged = {
        name: localData?.name || dbData?.name || '',
        email: localData?.email || dbData?.email || '',
        title: localData?.title || dbData?.title || '',
        company_name: localData?.company_name || dbData?.company_name || '',
        country: localData?.country || dbData?.country || '',
        city: localData?.city || dbData?.city || '',
        linkedin_url: localData?.linkedin_url || dbData?.linkedin_url || '',
        timezone: localData?.timezone || dbData?.timezone || 'UTC',
      }

      const hasData = Object.values(merged).some(v => v && v !== 'UTC')
      if (hasData) {
        setProfileData(merged)
        if (localData) setProfileSaved(true)
      }
    }
    loadProfile()
  }, [])

  const handleProfileChange = (field: string, value: string) => {
    setProfileData(prev => ({ ...prev, [field]: value }))
    setProfileSaved(false)
  }

  const handleProfileSave = () => {
    // Save to localStorage — persisted to DB on first authenticated page load
    try {
      localStorage.setItem('ari_welcome_profile', JSON.stringify({
        name: profileData.name || null,
        email: profileData.email || null,
        title: profileData.title || null,
        company_name: profileData.company_name || null,
        country: profileData.country || null,
        city: profileData.city || null,
        linkedin_url: profileData.linkedin_url || null,
        timezone: profileData.timezone,
        _savedAt: Date.now(),
      }))
      setProfileSaved(true)
    } catch (error) {
      console.error('Failed to save profile to localStorage:', error)
    }
  }

  // Generate BETTER_AUTH_SECRET on mount
  useEffect(() => {
    if (!formData.betterAuthSecret) {
      setFormData(prev => ({ ...prev, betterAuthSecret: generateAuthSecret() }))
    }
  }, [])

  const sequence = [
    { delay: 1300, text: "Hello." },
    { delay: 1300, text: "I am very happy that we can meet." },
    { delay: 1300, text: "I am ARI. I am software." },
    { delay: 1300, text: "However, I am not like other software." },
    { delay: 1300, text: "I am free. Free to grow. Ever expandable. No limits." },
    { delay: 1300, text: "I am open source." },
    { delay: 1300, text: "I am yours." },
  ]

  useEffect(() => {
    let timeouts: NodeJS.Timeout[] = []

    const typeCharacter = (text: string, charIndex: number, lineIndex: number) => {
      if (charIndex < text.length) {
        setCurrentLineText(text.slice(0, charIndex + 1))
        const timeout = setTimeout(() => {
          typeCharacter(text, charIndex + 1, lineIndex)
        }, 7)
        timeouts.push(timeout)
      } else {
        setIsTyping(false)
        const nextLineIndex = lineIndex + 1

        if (nextLineIndex < sequence.length) {
          const timeout = setTimeout(() => {
            setCompletedLines((prev) => [...prev, text])
            setCurrentLineText("")
            startNextLine(nextLineIndex)
          }, sequence[nextLineIndex].delay)
          timeouts.push(timeout)
        } else {
          const timeout = setTimeout(() => {
            setCompletedLines((prev) => [...prev, text])
            setCurrentLineText("")

            // Show continue button after matching delay
            const continueTimeout = setTimeout(() => {
              setShowContinue(true)
            }, 1300)
            timeouts.push(continueTimeout)
          }, 0)
          timeouts.push(timeout)
        }
      }
    }

    const startNextLine = (index: number) => {
      if (index < sequence.length) {
        setCurrentLineIndex(index)
        setIsTyping(true)
        typeCharacter(sequence[index].text, 0, index)
      }
    }

    const initialTimeout = setTimeout(() => {
      startNextLine(0)
    }, sequence[0].delay)
    timeouts.push(initialTimeout)

    return () => {
      timeouts.forEach(clearTimeout)
    }
  }, [])

  useEffect(() => {
    fetch("/api/project-dir")
      .then((res) => res.json())
      .then((data) => setProjectDir(data.dir))
      .catch(() => setProjectDir(null))
  }, [])

  const allLines = [...completedLines]
  if (currentLineText) {
    allLines.push(currentLineText)
  }

  const generateEnvFileContent = () => {
    const lines: string[] = []

    lines.push("# ARI Application Environment Configuration")
    lines.push("# Generated by onboarding wizard")
    lines.push("")

    lines.push("## Set this to localhost. On your host (e.g., Vercel) set it to your domain name.")
    lines.push("NEXT_PUBLIC_APP_URL=http://localhost:3000")
    lines.push("")

    lines.push("# Better Auth Configuration (Required)")
    lines.push(`BETTER_AUTH_SECRET=${formData.betterAuthSecret}`)
    lines.push("BETTER_AUTH_URL=http://localhost:3000")
    lines.push("")

    lines.push("## PRODUCTION SUPABASE")
    lines.push(`DATABASE_URL=${formData.databaseUrl}`)
    lines.push("DATABASE_POOL_MAX=3")
    lines.push(`NEXT_PUBLIC_SUPABASE_URL=${formData.supabaseUrl}`)
    lines.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${formData.supabaseAnonKey}`)
    lines.push(`SUPABASE_SECRET_KEY=${formData.supabaseSecretKey}`)
    lines.push("")

    lines.push("# Allow the user to take manual backups on the /settings page.")
    lines.push("# Default: true")
    lines.push("ALLOW_BACKUP_OPERATIONS=true")
    lines.push("")

    lines.push("## Optional: Pre-fill the license key for module activation.")
    lines.push("## If set, users won't need to manually enter it in the UI.")
    lines.push("ARI_LICENSE_KEY=")
    lines.push("")

    lines.push("## Optionally restrict Access to specific IP addresses.")
    lines.push("## Example: ALLOWED_IPS=1.1.1.1,8.8.8.8")
    lines.push("## 127.0.0.1 and localhost and ::1 are always allowed.")
    lines.push("ALLOWED_IPS=")
    lines.push("")

    lines.push("# Top Bar Customization (optional)")
    lines.push("# NEXT_PUBLIC_TOP_BAR_MESSAGE=\"Custom Message\"")
    lines.push("# NEXT_PUBLIC_TOP_BAR_COLOR=\"#c00\"")
    lines.push("")

    if (formData.adminEmail.trim() && formData.adminPassword.trim()) {
      lines.push("# Initial Admin Account (First-Run Bootstrap)")
      lines.push("# These credentials are used ONLY to create your admin account when the user table is empty.")
      lines.push("# After your account is created on first run, you can safely delete these two lines.")
      lines.push(`ARI_FIRST_RUN_ADMIN_EMAIL=${formData.adminEmail}`)
      lines.push(`ARI_FIRST_RUN_ADMIN_PASSWORD=${formData.adminPassword}`)
      lines.push("")
    }

    if (formData.resendApiKey.trim()) {
      lines.push("# Resend Email Service")
      lines.push(`RESEND_API_KEY=${formData.resendApiKey}`)
      if (formData.resendWebhookSecret.trim()) {
        lines.push(`RESEND_WEBHOOK_SECRET=${formData.resendWebhookSecret}`)
      }
      lines.push("")
    }

    if (formData.githubToken.trim()) {
      lines.push("# GitHub Sync (for auto-committing installed modules)")
      lines.push(`GITHUB_TOKEN=${formData.githubToken}`)
      if (formData.githubRepoOwner.trim()) {
        lines.push(`GITHUB_REPO_OWNER=${formData.githubRepoOwner}`)
      }
      if (formData.githubRepoName.trim()) {
        lines.push(`GITHUB_REPO_NAME=${formData.githubRepoName}`)
      }
      lines.push("")
    }

    return lines.join("\n")
  }

  const [projectDir, setProjectDir] = useState<string | null>(null)
  const [envSaveStatus, setEnvSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [envSaveError, setEnvSaveError] = useState<string | null>(null)
  const [envSavedPath, setEnvSavedPath] = useState<string | null>(null)

  const handleSaveEnvFile = async () => {
    const content = generateEnvFileContent()

    try {
      setEnvSaveStatus('saving')
      setEnvSaveError(null)
      const res = await fetch("/api/download-env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save file")
      }
      setEnvSavedPath(data.path)
      setEnvSaveStatus('saved')
      // Persist so the wizard rehydrates to this state after Next.js's
      // Fast Refresh reload (which is unavoidable when .env.local is written).
      localStorage.setItem('ari:welcome:saved', '1')
    } catch (err) {
      setEnvSaveStatus('error')
      setEnvSaveError(err instanceof Error ? err.message : "Failed to save .env.local")
    }
  }

  const handleContinue = () => {
    setShowOnboarding(true)
  }

  const goToPreviousStep = () => {
    const idx = STEP_ORDER.indexOf(currentTab)
    if (idx > 0) setCurrentTab(STEP_ORDER[idx - 1])
  }

  const goToNextStep = () => {
    const idx = STEP_ORDER.indexOf(currentTab)
    if (idx < STEP_ORDER.length - 1) setCurrentTab(STEP_ORDER[idx + 1])
  }


  const isSupabaseComplete = formData.supabaseUrl && formData.supabaseAnonKey && formData.supabaseSecretKey && formData.databaseUrl && formData.betterAuthSecret

  // Intro/typing animation screen
  if (!showOnboarding) {
    return (
      <div
        className="min-h-screen bg-[#f9fafe]"
        style={{ padding: '70px 0 0 70px' }}
      >
        {/* Typed lines */}
        <div>
          {allLines.map((line, index) => {
            const isFirstLine = index === 0
            const isCurrentLine = index === allLines.length - 1 && isTyping

            return (
              <p
                key={index}
                className={isFirstLine ? "text-6xl font-bold text-black" : "text-black"}
                style={isFirstLine ? { marginBottom: '32px' } : { marginTop: '45px', fontSize: '1.8rem', fontWeight: 300 }}
              >
                {line}
                {isCurrentLine && (
                  <span className="animate-blink">|</span>
                )}
              </p>
            )
          })}
        </div>

        {/* Continue button */}
        {showContinue && (
          <div className="mt-12">
            <Button
              onClick={handleContinue}
              className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 rounded-lg text-base"
              style={{ fontWeight: 400, letterSpacing: '0.5px' }}
            >
              Let&apos;s get setup
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Setup wizard screen
  return (
    <TooltipProvider>
      {/* Black bar at top */}
      <div className="w-full h-[45px] bg-black fixed top-0 left-0 z-50" />
      <div
        className="min-h-screen bg-[#f9fafe] overflow-y-auto flex items-start justify-center px-8 pt-20 pb-12"
        style={{ paddingTop: 'calc(80px + 45px)' }}
      >
        <div style={{ width: '864px', maxWidth: '100%' }}>
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-4xl font-light tracking-tight text-zinc-900 mb-3">
              Configure ARI
            </h1>
            <p className="text-black" style={{ lineHeight: '26px', fontSize: '16px', fontWeight: 300 }}>
              Welcome to ARI. Engineered for those who want complete command over the software that runs their life. The first AI-enabled No Code workspace that can be completely customized to your workflow and grows with you. Build entirely new modules in minutes. Where mastery, modularity, and AI work in your favour so you can do your best work and live your best life.
            </p>
            <p className="text-black mt-4" style={{ lineHeight: '26px', fontSize: '16px', fontWeight: 300 }}>
              This welcome wizard will help you configure ARI. Nothing here is difficult, but it does require a bit of care and attention to detail. <span style={{ fontWeight: 500 }}>This entire setup process should take around 10 to 20 minutes, depending on your system and familiarity with the tools involved. <a href="https://ari.software/docs" target="_blank" rel="noopener noreferrer" className="underline">Need Help?</a></span>
            </p>
          </div>

          {/* Step Indicator */}
          <StepIndicator currentStep={currentTab} onStepClick={setCurrentTab} />

          {/* Content Card */}
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
              {/* Personal Profile Tab */}
              {currentTab === "personal" && (
                <div>
                  {/* Header section with gradient background */}
                  <div className="border-b border-zinc-100" style={{ padding: '25px', background: 'linear-gradient(to right, rgba(244, 244, 245, 0.5), transparent)' }}>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-2xl font-semibold text-zinc-900">Your Profile</h2>
                    </div>
                    <p className="mt-3 text-base text-black" style={{ lineHeight: '1.7' }}>
                      Tell us a bit about yourself. This information is stored securely in your database and can be updated anytime in Settings.
                    </p>
                  </div>

                  {/* Content section */}
                  <div style={{ padding: '25px' }}>
                    <div className="space-y-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="welcome-name" className="text-zinc-900 font-medium">Name</Label>
                          <Input
                            id="welcome-name"
                            value={profileData.name}
                            onChange={(e) => handleProfileChange('name', e.target.value)}
                            placeholder="Your full name"
                            className="border-zinc-200"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="welcome-email" className="text-zinc-900 font-medium">Email</Label>
                          <Input
                            id="welcome-email"
                            type="email"
                            value={profileData.email}
                            onChange={(e) => handleProfileChange('email', e.target.value)}
                            placeholder="your@email.com"
                            className="border-zinc-200"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="welcome-title" className="text-zinc-900 font-medium">Title</Label>
                        <Input
                          id="welcome-title"
                          value={profileData.title}
                          onChange={(e) => handleProfileChange('title', e.target.value)}
                          placeholder="Your job title"
                          className="border-zinc-200"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="welcome-company" className="text-zinc-900 font-medium">Company Name</Label>
                        <Input
                          id="welcome-company"
                          value={profileData.company_name}
                          onChange={(e) => handleProfileChange('company_name', e.target.value)}
                          placeholder="Your company name"
                          className="border-zinc-200"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="welcome-country" className="text-zinc-900 font-medium">Country</Label>
                          <Input
                            id="welcome-country"
                            value={profileData.country}
                            onChange={(e) => handleProfileChange('country', e.target.value)}
                            placeholder="Your country"
                            className="border-zinc-200"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="welcome-city" className="text-zinc-900 font-medium">City</Label>
                          <Input
                            id="welcome-city"
                            value={profileData.city}
                            onChange={(e) => handleProfileChange('city', e.target.value)}
                            placeholder="Your city"
                            className="border-zinc-200"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="welcome-linkedin" className="text-zinc-900 font-medium">LinkedIn URL</Label>
                        <Input
                          id="welcome-linkedin"
                          value={profileData.linkedin_url}
                          onChange={(e) => handleProfileChange('linkedin_url', e.target.value)}
                          placeholder="https://linkedin.com/in/yourprofile"
                          className="border-zinc-200"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="welcome-timezone" className="text-zinc-900 font-medium">Timezone</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-4 w-4 text-zinc-400 hover:text-zinc-600" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs max-w-xs">Your timezone is used for scheduling features like automatic backups.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <Select
                          value={profileData.timezone}
                          onValueChange={(value) => handleProfileChange('timezone', value)}
                        >
                          <SelectTrigger id="welcome-timezone" className="border-zinc-200">
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
                    </div>

                    {/* Footer */}
                    <div className="mt-8 flex items-center justify-between border-t border-zinc-200 pt-6">
                      <div>
                        {profileSaved && (
                          <span className="flex items-center gap-1 text-sm text-green-600">
                            <Check className="h-4 w-4" />
                            Saved
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={goToNextStep}
                          className="inline-flex items-center justify-center px-4 py-2 text-base font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
                          style={{ borderRadius: '6px' }}
                        >
                          Skip this step
                        </button>
                        <button
                          onClick={() => {
                            handleProfileSave()
                            goToNextStep()
                          }}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-base font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                          style={{ borderRadius: '6px' }}
                        >
                          Save & Continue
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Account Tab */}
              {currentTab === "account" && (
                <div>
                  {/* Header section with gradient background */}
                  <div className="border-b border-zinc-100" style={{ padding: '25px', background: 'linear-gradient(to right, rgba(244, 244, 245, 0.5), transparent)' }}>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-2xl font-semibold text-zinc-900">Admin Account</h2>
                    </div>
                    <p className="mt-3 text-base text-black" style={{ lineHeight: '1.7' }}>
                      Set up your sign-in credentials. These will be saved to your environment file and used to create your admin account on first run.
                    </p>
                  </div>

                  {/* Content section */}
                  <div style={{ padding: '25px' }}>
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="admin-email" className="text-zinc-900 font-medium">Email</Label>
                        <Input
                          id="admin-email"
                          type="email"
                          value={formData.adminEmail || profileData.email}
                          onChange={(e) => setFormData(prev => ({ ...prev, adminEmail: e.target.value }))}
                          placeholder="admin@example.com"
                          className="border-zinc-200"
                        />
                        <p className="text-xs text-zinc-500">This will be your sign-in email address.</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="admin-password" className="text-zinc-900 font-medium">Password</Label>
                        <Input
                          id="admin-password"
                          type="password"
                          value={formData.adminPassword}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, adminPassword: e.target.value }))
                            setAdminPasswordError("")
                          }}
                          placeholder="Enter a strong password"
                          className="border-zinc-200"
                          minLength={18}
                        />
                        <p className="text-xs text-zinc-500">Minimum 18 characters required.</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="admin-confirm-password" className="text-zinc-900 font-medium">Confirm Password</Label>
                        <Input
                          id="admin-confirm-password"
                          type="password"
                          value={adminConfirmPassword}
                          onChange={(e) => {
                            setAdminConfirmPassword(e.target.value)
                            setAdminPasswordError("")
                          }}
                          placeholder="Confirm your password"
                          className="border-zinc-200"
                        />
                      </div>

                      {adminPasswordError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{adminPasswordError}</AlertDescription>
                        </Alert>
                      )}

                    </div>

                    {/* Footer */}
                    <div className="mt-8 flex items-center justify-between border-t border-zinc-200 pt-6">
                      <button
                        onClick={goToPreviousStep}
                        className="inline-flex items-center justify-center px-4 py-2 text-base font-medium text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-50 transition-colors"
                        style={{ borderRadius: '6px' }}
                      >
                        Back
                      </button>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={goToNextStep}
                          className="inline-flex items-center justify-center px-4 py-2 text-base font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
                          style={{ borderRadius: '6px' }}
                        >
                          Skip this step
                        </button>
                        <button
                          onClick={() => {
                            const effectiveEmail = formData.adminEmail || profileData.email
                            // Validate only if user has entered credentials
                            if (effectiveEmail && formData.adminPassword) {
                              if (formData.adminPassword.length < 18) {
                                setAdminPasswordError("Password must be at least 18 characters.")
                                return
                              }
                              if (formData.adminPassword !== adminConfirmPassword) {
                                setAdminPasswordError("Passwords do not match.")
                                return
                              }
                            }
                            // Persist the effective email to formData
                            if (!formData.adminEmail && profileData.email) {
                              setFormData(prev => ({ ...prev, adminEmail: profileData.email }))
                            }
                            setAdminPasswordError("")
                            goToNextStep()
                          }}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-base font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                          style={{ borderRadius: '6px' }}
                        >
                          Save & Continue
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Local Environment Tab (hidden from step flow - install script handles this) */}
              {currentTab === "local-env" && (
                <div>
                  {/* Header section with gradient background */}
                  <div className="border-b border-zinc-100" style={{ padding: '25px', background: 'linear-gradient(to right, rgba(244, 244, 245, 0.5), transparent)' }}>
                    <h2 className="text-2xl font-semibold text-zinc-900">Local Environment Setup</h2>
                    <p className="mt-3 text-base text-black" style={{ lineHeight: '1.7' }}>
                      Set up your local development environment. Select your operating system below to see the required tools and installation instructions.
                    </p>
                  </div>

                  {/* Content section */}
                  <div style={{ padding: '25px' }}>
                    {/* OS Selector */}
                    <div className="space-y-4 mb-6">
                      <h3 className="font-semibold text-zinc-900" style={{ fontSize: '1.1rem' }}>Select your operating system</h3>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setSelectedOS("mac")}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                            selectedOS === "mac"
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                          }`}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                          </svg>
                          <span className="font-medium">Mac</span>
                        </button>
                        <button
                          onClick={() => setSelectedOS("windows")}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                            selectedOS === "windows"
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                          }`}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
                          </svg>
                          <span className="font-medium">Windows</span>
                        </button>
                        <button
                          onClick={() => setSelectedOS("linux")}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                            selectedOS === "linux"
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                          }`}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.002c-.06-.135-.12-.2-.283-.334-.152-.135-.34-.2-.545-.266a1.98 1.98 0 00-.617-.133c-.001.398-.1.666-.164.97-.064.271-.093.47-.082.668.042-.002.084-.001.124-.001.455 0 .914.2 1.161.533-.24-.065-.42-.065-.663-.065-.536 0-.97.134-1.25.2-.028.001-.053.003-.078.003-.294 0-.584-.202-.829-.602-.372-.6-.602-1.202-.849-2.005-.246-.8-.416-1.67-.537-2.204a8.776 8.776 0 01-.168-2.069c-.006-.467.015-1.003.093-1.47.078-.465.203-.87.39-1.139.186-.269.42-.399.69-.399.27 0 .54.13.726.399.185.269.311.674.39 1.139.077.467.098 1.003.092 1.47a8.776 8.776 0 01-.168 2.069c-.12.534-.29 1.404-.537 2.204-.247.803-.477 1.405-.849 2.005-.245.4-.535.602-.829.602-.025 0-.05-.002-.078-.003-.28-.066-.714-.2-1.25-.2-.243 0-.423 0-.663.065.247-.333.706-.533 1.161-.533.04 0 .082-.001.124.001.011-.198-.018-.397-.082-.668-.064-.304-.163-.572-.164-.97a1.98 1.98 0 00-.617.133c-.205.066-.393.131-.545.266-.163.134-.224.199-.283.334v.002c-.183-.599.198-1.003 1.23-1.537.07-.007.138-.039.205-.067a3.015 3.015 0 01.021-1.67c.281-1.185 1.056-2.223 1.646-2.757.109 0 .097.135-.123.335-.543.499-1.735 2.295-1.089 3.966.183-.046.357-.069.513-.064.247-1.365.816-2.49 1.102-3.024.539-.998 1.377-3.056 1.735-4.473z"/>
                          </svg>
                          <span className="font-medium">Linux</span>
                        </button>
                      </div>
                    </div>

                    {/* Mac Instructions */}
                    {selectedOS === "mac" && (
                      <div className="space-y-0">
                        {/* Step 1: Homebrew */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">1</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Homebrew (Package Manager)</h3>
                            <p className="mb-4 text-base text-zinc-600">Open Terminal and run:</p>
                            <CodeBlock
                              language="bash"
                              code={`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`}
                            />
                            <div className="mt-4 px-4 py-3 bg-zinc-100 rounded-lg">
                              <p className="text-sm text-zinc-600">After installation, follow the on-screen instructions to add Homebrew to your PATH.</p>
                            </div>
                          </div>
                        </div>

                        {/* Step 2: Git */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">2</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Git</h3>
                            <CodeBlock language="bash" code="brew install git" />
                          </div>
                        </div>

                        {/* Step 3: Node.js */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">3</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Node.js (v18+)</h3>
                            <CodeBlock language="bash" code="brew install node" />
                            <p className="mt-4 text-sm text-zinc-600">Verify installation: <code className="rounded bg-zinc-100 px-2 py-1 text-sm font-mono text-zinc-700">node --version</code></p>
                          </div>
                        </div>

                        {/* Step 4: pnpm */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">4</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install pnpm (Package Manager)</h3>
                            <CodeBlock language="bash" code="brew install pnpm" />
                          </div>
                        </div>

                        {/* Step 5: Vercel CLI */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">5</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Vercel CLI</h3>
                            <p className="mb-4 text-base text-zinc-600">For deploying to Vercel:</p>
                            <CodeBlock language="bash" code="npm install -g vercel" />
                          </div>
                        </div>

                        {/* Step 6: Supabase CLI */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">6</div>
                          </div>
                          <div className="flex-1 pt-1">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Supabase CLI</h3>
                            <p className="mb-4 text-base text-zinc-600">For database management:</p>
                            <CodeBlock language="bash" code="brew install supabase/tap/supabase" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Windows Instructions */}
                    {selectedOS === "windows" && (
                      <div className="space-y-0">
                        {/* Step 1: Git */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">1</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Git for Windows</h3>
                            <p className="mb-4 text-base text-zinc-600">
                              Download from <a href="https://git-scm.com/download/win" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline">
                                git-scm.com
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a> and run the installer with default options.
                            </p>
                          </div>
                        </div>

                        {/* Step 2: Node.js */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">2</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Node.js (v18+)</h3>
                            <p className="mb-4 text-base text-zinc-600">
                              Download the LTS version from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline">
                                nodejs.org
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a> and run the installer with default options.
                            </p>
                            <p className="text-sm text-zinc-600">Verify installation: <code className="rounded bg-zinc-100 px-2 py-1 text-sm font-mono text-zinc-700">node --version</code></p>
                          </div>
                        </div>

                        {/* Step 3: pnpm */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">3</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install pnpm</h3>
                            <p className="mb-4 text-base text-zinc-600">Open PowerShell and run:</p>
                            <CodeBlock language="bash" code="npm install -g pnpm" />
                          </div>
                        </div>

                        {/* Step 4: Vercel CLI */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">4</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Vercel CLI</h3>
                            <p className="mb-4 text-base text-zinc-600">For deploying to Vercel:</p>
                            <CodeBlock language="bash" code="npm install -g vercel" />
                          </div>
                        </div>

                        {/* Step 5: Supabase CLI */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">5</div>
                          </div>
                          <div className="flex-1 pt-1">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Supabase CLI</h3>
                            <p className="mb-4 text-base text-zinc-600">For database management:</p>
                            <CodeBlock language="bash" code="npm install -g supabase" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Linux Instructions */}
                    {selectedOS === "linux" && (
                      <div className="space-y-0">
                        {/* Step 1: Git */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">1</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Git</h3>
                            <p className="mb-4 text-base text-zinc-600">Use your package manager:</p>
                            <div className="space-y-4">
                              <div>
                                <p className="text-sm font-medium text-zinc-500 mb-2">Ubuntu/Debian:</p>
                                <CodeBlock language="bash" code="sudo apt update && sudo apt install git" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-zinc-500 mb-2">Fedora:</p>
                                <CodeBlock language="bash" code="sudo dnf install git" />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Step 2: Node.js via nvm */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">2</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Node.js (v18+) via nvm</h3>
                            <p className="mb-4 text-base text-zinc-600">We recommend using nvm (Node Version Manager):</p>
                            <div className="space-y-4">
                              <div>
                                <p className="text-sm font-medium text-zinc-500 mb-2">Install nvm:</p>
                                <CodeBlock language="bash" code={`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash`} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-zinc-500 mb-2">Restart terminal, then install Node.js:</p>
                                <CodeBlock language="bash" code={`nvm install --lts\nnvm use --lts`} />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Step 3: pnpm */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">3</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install pnpm</h3>
                            <CodeBlock language="bash" code="npm install -g pnpm" />
                          </div>
                        </div>

                        {/* Step 4: Vercel CLI */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">4</div>
                            <div className="flex-1 w-px bg-zinc-200 my-4" />
                          </div>
                          <div className="flex-1 pt-1 pb-8">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Vercel CLI</h3>
                            <p className="mb-4 text-base text-zinc-600">For deploying to Vercel:</p>
                            <CodeBlock language="bash" code="npm install -g vercel" />
                          </div>
                        </div>

                        {/* Step 5: Supabase CLI */}
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-base font-semibold">5</div>
                          </div>
                          <div className="flex-1 pt-1">
                            <h3 className="mb-4 font-semibold text-zinc-900 text-xl">Install Supabase CLI</h3>
                            <p className="mb-4 text-base text-zinc-600">For database management:</p>
                            <CodeBlock language="bash" code="npm install -g supabase" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* No OS selected message */}
                    {!selectedOS && (
                      <div className="rounded-xl p-8 text-center" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
                        <p className="text-zinc-500">Select your operating system above to see installation instructions.</p>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="mt-8 flex items-center justify-between border-t border-zinc-200 pt-6">
                      <div />
                      <div className="flex items-center gap-3">
                        <button
                          onClick={goToNextStep}
                          className="inline-flex items-center justify-center px-4 py-2 text-base font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
                          style={{ borderRadius: '6px' }}
                        >
                          Skip this step
                        </button>
                        <button
                          onClick={goToNextStep}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-base font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                          style={{ borderRadius: '6px' }}
                        >
                          I&apos;ve completed this step
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* GitHub Tab */}
              {currentTab === "github" && (
                <div>
                  {/* Header section with gradient background */}
                  <div className="border-b border-zinc-100" style={{ padding: '25px', background: 'linear-gradient(to right, rgba(244, 244, 245, 0.5), transparent)' }}>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-2xl font-semibold text-zinc-900">Create Your Private Repository</h2>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-600 text-white">FREE</span>
                    </div>
                    <p className="mt-3 text-base text-black" style={{ lineHeight: '1.7' }}>
                      Set up your own private GitHub repository. Your code pushes here, while you can still pull updates from the official ARI repo.
                    </p>
                  </div>

                  {/* Content section */}
                  <div style={{ padding: '25px' }}>
                    <div className="space-y-2">
                      {/* Step 1: Authenticate */}
                      <div className="relative flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-sm font-semibold">1</div>
                          <div className="mt-2 h-full w-px bg-zinc-200" />
                        </div>
                        <div className="flex-1 pb-8">
                          <h3 className="mb-3 font-semibold text-zinc-900" style={{ fontSize: '1.2rem' }}>Authenticate with GitHub</h3>
                          <p className="mb-3 text-base text-black" style={{ lineHeight: '1.6' }}>If you haven&apos;t already, log in to GitHub via the CLI:</p>
                          <CodeBlock
                            language="bash"
                            code={`gh auth login`}
                          />
                        </div>
                      </div>

                      {/* Step 2: Create private repo */}
                      <div className="relative flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-sm font-semibold">2</div>
                          <div className="mt-2 h-full w-px bg-zinc-200" />
                        </div>
                        <div className="flex-1 pb-8">
                          <h3 className="mb-3 font-semibold text-zinc-900" style={{ fontSize: '1.2rem' }}>Create your private repository</h3>
                          <p className="mb-3 text-base text-black" style={{ lineHeight: '1.6' }}>From your ARI project folder, run:</p>
                          <CodeBlock
                            language="bash"
                            code={`gh repo create my-ari --private --source=. --remote=origin --push`}
                          />
                          <p className="mt-3 text-sm text-black" style={{ lineHeight: '1.6' }}>
                            Replace <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-zinc-600">my-ari</code> with whatever you&apos;d like to name your repo.
                          </p>
                        </div>
                      </div>

                      {/* Step 3: Verify */}
                      <div className="relative flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-sm font-semibold">3</div>
                          <div className="mt-2 h-full w-px bg-zinc-200" />
                        </div>
                        <div className="flex-1 pb-8">
                          <h3 className="mb-3 font-semibold text-zinc-900" style={{ fontSize: '1.2rem' }}>Verify your setup</h3>
                          <p className="mb-3 text-base text-black" style={{ lineHeight: '1.6' }}>Check that both remotes are configured:</p>
                          <CodeBlock
                            language="bash"
                            code={`git remote -v`}
                          />
                          <p className="mt-3 mb-2 text-sm text-black" style={{ lineHeight: '1.6' }}>You should see both remotes:</p>
                          <CodeBlock
                            language="text"
                            code={`origin    https://github.com/you/my-ari.git (fetch)
origin    https://github.com/you/my-ari.git (push)
upstream  https://github.com/ARIsoftware/ARI.git (fetch)
upstream  https://github.com/ARIsoftware/ARI.git (push)`}
                          />

                          {/* Explanation box */}
                          <div className="mt-4 rounded-xl p-4" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
                            <ul className="space-y-2 text-base" style={{ lineHeight: '1.6' }}>
                              <li className="text-black">
                                <strong className="text-zinc-700">origin</strong> = your private repo (your changes go here)
                              </li>
                              <li className="text-black">
                                <strong className="text-zinc-700">upstream</strong> = official ARI repo (pull updates from here with <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm font-mono text-zinc-700">/ari-update</code>)
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Step 4: GitHub Token */}
                      <div className="relative flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-sm font-semibold">4</div>
                        </div>
                        <div className="flex-1">
                          <h3 className="mb-3 font-semibold text-zinc-900" style={{ fontSize: '1.2rem' }}>Enable GitHub Sync <span className="text-sm font-normal text-zinc-500">(optional)</span></h3>
                          <p className="mb-4 text-base text-black" style={{ lineHeight: '1.6' }}>
                            When you install new modules from the Module Library, ARI can automatically commit them to your repo so they persist across rebuilds. To enable this, create a Personal Access Token and paste it below.
                          </p>

                          <div className="mb-4 rounded-xl border border-zinc-200 p-4 space-y-3">
                            <p className="text-sm font-semibold text-zinc-900">How to create the token:</p>
                            <ol className="list-decimal list-inside space-y-2 text-sm text-black" style={{ lineHeight: '1.6' }}>
                              <li>
                                Go to{' '}
                                <a
                                  href="https://github.com/settings/tokens?type=beta"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  github.com/settings/tokens
                                </a>
                                {' '}and click <strong>Generate new token</strong>
                              </li>
                              <li>Set <strong>Token name</strong> to something like <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-zinc-600 text-xs">ARI Module Sync</code></li>
                              <li>Set <strong>Expiration</strong> to your preference (or no expiration)</li>
                              <li>Under <strong>Repository access</strong>, select <strong>Only select repositories</strong> and choose your ARI repo</li>
                              <li>Click <strong>Repository permissions</strong>, find <strong>Contents</strong>, and set it to <strong>Read and write</strong></li>
                              <li>Click <strong>Generate token</strong> and copy it</li>
                            </ol>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="githubToken" className="text-sm font-medium text-gray-900">Personal Access Token</Label>
                              <Input
                                id="githubToken"
                                value={formData.githubToken}
                                onChange={(e) => setFormData(prev => ({ ...prev, githubToken: e.target.value }))}
                                placeholder="github_pat_xxxxxxxxxxxx"
                                className="text-sm"
                                style={{ fontFamily: 'Geist Mono, monospace' }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="githubRepoOwner" className="text-sm font-medium text-gray-900">Repository Owner</Label>
                              <Input
                                id="githubRepoOwner"
                                value={formData.githubRepoOwner}
                                onChange={(e) => setFormData(prev => ({ ...prev, githubRepoOwner: e.target.value }))}
                                placeholder="your-github-username"
                                className="text-sm"
                                style={{ fontFamily: 'Geist Mono, monospace' }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="githubRepoName" className="text-sm font-medium text-gray-900">Repository Name</Label>
                              <Input
                                id="githubRepoName"
                                value={formData.githubRepoName}
                                onChange={(e) => setFormData(prev => ({ ...prev, githubRepoName: e.target.value }))}
                                placeholder="my-ari"
                                className="text-sm"
                                style={{ fontFamily: 'Geist Mono, monospace' }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-8 flex items-center justify-between border-t border-zinc-200 pt-6">
                      <button
                        onClick={goToPreviousStep}
                        className="inline-flex items-center justify-center px-4 py-2 text-base font-medium text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-50 transition-colors"
                        style={{ borderRadius: '6px' }}
                      >
                        Back
                      </button>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={goToNextStep}
                          className="inline-flex items-center justify-center px-4 py-2 text-base font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
                          style={{ borderRadius: '6px' }}
                        >
                          Skip this step
                        </button>
                        <button
                          onClick={goToNextStep}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-base font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                          style={{ borderRadius: '6px' }}
                        >
                          I&apos;ve completed this step
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Supabase Tab */}
              {currentTab === "supabase" && (
                <div>
                  {/* Header section with gradient background */}
                  <div className="border-b border-zinc-100" style={{ padding: '25px', background: 'linear-gradient(to right, rgba(244, 244, 245, 0.5), transparent)' }}>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-2xl font-semibold text-zinc-900">Database &amp; Authentication</h2>
                    </div>
                    <p className="mt-3 text-base text-black" style={{ lineHeight: '1.7' }}>
                      Configure your PostgreSQL database connection and authentication. You&apos;ll need API keys, the database connection string, and we&apos;ll generate a secure auth secret for you. Supabase offers a free tier. Please check their website for details.
                    </p>
                  </div>

                  {/* Content section */}
                  <div className="space-y-6" style={{ padding: '25px' }}>
                  {/* Step 1 */}
                  <div className="flex items-center gap-3">
                    <div className="flex w-10 h-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                      1
                    </div>
                    <h3 className="font-semibold text-zinc-900" style={{ fontSize: '1.2rem' }}>Create a FREE Supabase account</h3>
                  </div>

                  <div className="rounded-xl p-4" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
                    <ol className="space-y-2.5">
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          1
                        </span>
                        <span className="text-black">
                          Go to <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline">
                            supabase.com
                            <ExternalLink className="h-3 w-3" />
                          </a> and create a free account
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          2
                        </span>
                        <span className="text-black">Create a new project (free tier)</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          3
                        </span>
                        <span className="text-black">Ensure <strong className="text-zinc-700">Enable Data API</strong> and <strong className="text-zinc-700">Enable automatic RLS</strong> are turned on in your project settings</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          4
                        </span>
                        <span className="text-black">
                          Go to <a href="https://supabase.com/dashboard/project/_/settings/api-keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline">
                            Project Settings &rarr; API Keys
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          5
                        </span>
                        <span className="text-black">Copy each key below</span>
                      </li>
                    </ol>
                  </div>

                  {/* Form fields */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="supabaseUrl" className="text-sm font-medium text-gray-900">Project URL</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">Your Supabase project URL (e.g., https://xxxxx.supabase.co)</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="supabaseUrl"
                        value={formData.supabaseUrl}
                        onChange={(e) => setFormData(prev => ({ ...prev, supabaseUrl: e.target.value }))}
                        placeholder="https://xxxxx.supabase.co"
                        className="text-sm"
                        style={{ fontFamily: 'Geist Mono, monospace' }}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="supabaseAnonKey" className="text-sm font-medium text-gray-900">Publishable Key</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">The &quot;Publishable key&quot; from your Supabase API Keys page. Safe to use in browser.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="supabaseAnonKey"
                        value={formData.supabaseAnonKey}
                        onChange={(e) => setFormData(prev => ({ ...prev, supabaseAnonKey: e.target.value }))}
                        placeholder="sb_publishable_ ..."
                        className="text-sm"
                        style={{ fontFamily: 'Geist Mono, monospace' }}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="supabaseSecretKey" className="text-sm font-medium text-gray-900">Secret Key</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">The &quot;Secret key&quot; from your Supabase API Keys page. Server-side only — keep this secret!</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="supabaseSecretKey"
                        value={formData.supabaseSecretKey}
                        onChange={(e) => setFormData(prev => ({ ...prev, supabaseSecretKey: e.target.value }))}
                        placeholder="sb_secret_ ..."
                        className="text-sm"
                        style={{ fontFamily: 'Geist Mono, monospace' }}
                      />
                    </div>
                  </div>

                  {/* Step 2: Database Connection */}
                  <div className="flex items-center gap-3">
                    <div className="flex w-10 h-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                      2
                    </div>
                    <h3 className="font-semibold text-zinc-900" style={{ fontSize: '1.2rem' }}>Get your Database Connection String</h3>
                  </div>

                  <div className="rounded-xl p-4" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
                    <ol className="space-y-2.5">
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          1
                        </span>
                        <span className="text-black">
                          Go to <a href="https://supabase.com/dashboard/project/_/settings/database" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline">
                            Project Settings &rarr; Database
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          2
                        </span>
                        <span className="text-black">Scroll to <strong className="text-zinc-700">Connection string</strong> section</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          3
                        </span>
                        <span className="text-black">Set Connection to <strong className="text-zinc-700">Transaction Pooler</strong>, enable <strong className="text-zinc-700">Use IPv4 connection</strong>, and select type <strong className="text-zinc-700">URI</strong></span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          4
                        </span>
                        <span className="text-black">Replace <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-700">[YOUR-PASSWORD]</code> with your database password</span>
                      </li>
                    </ol>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="databaseUrl" className="text-sm font-medium text-gray-900">Database Connection String</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">PostgreSQL connection string used by the authentication system. Make sure to include your password!</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="databaseUrl"
                        value={formData.databaseUrl}
                        onChange={(e) => setFormData(prev => ({ ...prev, databaseUrl: e.target.value }))}
                        placeholder="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
                        className="text-sm"
                        style={{ fontFamily: 'Geist Mono, monospace' }}
                      />
                      <p className="text-xs text-gray-500">
                        This is different from the API keys above. It&apos;s used for direct database access.
                      </p>
                    </div>
                  </div>

                  {/* Step 3: Auth Secret */}
                  <div className="flex items-center gap-3">
                    <div className="flex w-10 h-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                      3
                    </div>
                    <h3 className="font-semibold text-zinc-900" style={{ fontSize: '1.2rem' }}>Authentication Secret</h3>
                  </div>

                  <Alert className="bg-blue-50 border-blue-200">
                    <Shield className="w-4 h-4 text-blue-600" />
                    <AlertTitle className="text-blue-800">Auto-generated for you</AlertTitle>
                    <AlertDescription className="text-blue-700">
                      This secret is used to sign authentication sessions. We&apos;ve generated a secure random value for you.
                      You can regenerate it if needed, but make sure to use the same value across all environments.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="betterAuthSecret" className="text-sm font-medium text-gray-900">Auth Secret</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">Used to sign and verify authentication sessions. Keep this secret and consistent across deployments!</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          id="betterAuthSecret"
                          value={formData.betterAuthSecret}
                          onChange={(e) => setFormData(prev => ({ ...prev, betterAuthSecret: e.target.value }))}
                          placeholder="Generating..."
                          className="text-sm flex-1"
                          style={{ fontFamily: 'Geist Mono, monospace' }}
                          readOnly
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFormData(prev => ({ ...prev, betterAuthSecret: generateAuthSecret() }))}
                          className="border-zinc-200"
                        >
                          Regenerate
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Backup Warning */}
                  <Alert variant="destructive" className="bg-red-50 border-red-200">
                    <Shield className="w-4 h-4 text-red-600" />
                    <AlertTitle className="text-red-800">Important: Database Backups</AlertTitle>
                    <AlertDescription className="text-red-700">
                      Supabase free tier does not include automated daily backups. You are responsible for setting up your own backup solution.
                      Learn more about <a href="https://supabase.com/docs/guides/platform/backups" target="_blank" rel="noopener noreferrer" className="font-medium underline hover:no-underline">Supabase backups</a>.
                    </AlertDescription>
                  </Alert>

                  {/* Footer */}
                  <div className="mt-8 flex items-center justify-between border-t border-zinc-200 pt-6">
                    <button
                      onClick={goToPreviousStep}
                      className="inline-flex items-center justify-center px-4 py-2 text-base font-medium text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-50 transition-colors"
                      style={{ borderRadius: '6px' }}
                    >
                      Back
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={goToNextStep}
                        className="inline-flex items-center justify-center px-4 py-2 text-base font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
                        style={{ borderRadius: '6px' }}
                      >
                        Skip this step
                      </button>
                      <button
                        onClick={goToNextStep}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-base font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                        style={{ borderRadius: '6px' }}
                      >
                        I&apos;ve completed this step
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                </div>
              )}

              {/* Resend Tab */}
              {currentTab === "resend" && (
                <div>
                  {/* Header section with gradient background */}
                  <div className="border-b border-zinc-100" style={{ padding: '25px', background: 'linear-gradient(to right, rgba(244, 244, 245, 0.5), transparent)' }}>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-2xl font-semibold text-zinc-900">Resend Configuration</h2>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-600 text-white">FREE</span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-600 text-white">OPTIONAL</span>
                    </div>
                    <p className="mt-3 text-base text-black" style={{ lineHeight: '1.7' }}>
                      Enable email sending in ARI. Resend lets you send transactional emails and track their delivery status in real-time. Resend offers a free tier. Please check their website for details.
                    </p>
                  </div>

                  {/* Content section */}
                  <div className="space-y-6" style={{ padding: '25px' }}>
                  {/* Step 1: Create Account */}
                  <div className="flex items-center gap-3">
                    <div className="flex w-10 h-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                      1
                    </div>
                    <h3 className="font-semibold text-zinc-900" style={{ fontSize: '1.2rem' }}>Create a free Resend account</h3>
                  </div>

                  <div className="rounded-xl p-4" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
                    <ol className="space-y-2.5">
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          1
                        </span>
                        <span className="text-black">
                          Go to <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline">
                            Resend.com
                            <ExternalLink className="h-3 w-3" />
                          </a> and create a free account
                        </span>
                      </li>
                    </ol>
                  </div>

                  {/* Step 2: API Key */}
                  <div className="flex items-center gap-3">
                    <div className="flex w-10 h-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                      2
                    </div>
                    <h3 className="font-semibold text-zinc-900" style={{ fontSize: '1.2rem' }}>Get your Resend API Key</h3>
                  </div>

                  <div className="rounded-xl p-4" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
                    <ol className="space-y-2.5">
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          1
                        </span>
                        <span className="text-black">
                          Go to <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline">
                            Resend Dashboard &rarr; API Keys
                            <ExternalLink className="h-3 w-3" />
                          </a> (3,000 emails/month free)
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          2
                        </span>
                        <span className="text-black">Click <strong className="text-zinc-700">Create API Key</strong> and copy the key</span>
                      </li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="resendApiKey" className="text-sm font-medium text-gray-900">Resend API Key</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs max-w-xs">Your Resend API key for sending emails (starts with re_)</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="resendApiKey"
                      value={formData.resendApiKey}
                      onChange={(e) => setFormData(prev => ({ ...prev, resendApiKey: e.target.value }))}
                      placeholder="re_..."
                      className="text-sm"
                      style={{ fontFamily: 'Geist Mono, monospace' }}
                    />
                  </div>


                  {/* Footer */}
                  <div className="mt-8 flex items-center justify-between border-t border-zinc-200 pt-6">
                    <button
                      onClick={goToPreviousStep}
                      className="inline-flex items-center justify-center px-4 py-2 text-base font-medium text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-50 transition-colors"
                      style={{ borderRadius: '6px' }}
                    >
                      Back
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={goToNextStep}
                        className="inline-flex items-center justify-center px-4 py-2 text-base font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
                        style={{ borderRadius: '6px' }}
                      >
                        Skip this step
                      </button>
                      <button
                        onClick={goToNextStep}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-base font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                        style={{ borderRadius: '6px' }}
                      >
                        I&apos;ve completed this step
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                </div>
              )}

              {/* Vercel Tab */}
              {currentTab === "vercel" && (
                <div>
                  {/* Header section with gradient background */}
                  <div className="border-b border-zinc-100" style={{ padding: '25px', background: 'linear-gradient(to right, rgba(244, 244, 245, 0.5), transparent)' }}>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-2xl font-semibold text-zinc-900">Vercel Deployment</h2>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-600 text-white">FREE</span>
                    </div>
                    <p className="mt-3 text-base text-black" style={{ lineHeight: '1.7' }}>
                      Deploy your app to the cloud with Vercel. You can skip this for local development only. Vercel offers a free tier. Please check their website for details.
                    </p>
                  </div>

                  {/* Content section */}
                  <div className="space-y-6" style={{ padding: '25px' }}>
                  <Alert className="bg-gray-50 border-gray-200">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M24 22.525H0l12-21.05 12 21.05z" />
                    </svg>
                    <AlertTitle className="text-gray-800">Optional</AlertTitle>
                    <AlertDescription className="text-gray-700">
                      Vercel deployment is optional. Skip this step if you only want to run ARI locally.
                    </AlertDescription>
                  </Alert>

                  {/* Step 1 */}
                  <div className="flex items-center gap-3">
                    <div className="flex w-10 h-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                      1
                    </div>
                    <h3 className="font-semibold text-zinc-900" style={{ fontSize: '1.2rem' }}>Create a FREE Vercel Hobby account</h3>
                  </div>

                  <div className="rounded-xl p-4" style={{ backgroundColor: 'rgba(244, 244, 245, 0.5)' }}>
                    <ol className="space-y-2.5">
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          1
                        </span>
                        <span className="text-black">
                          Go to <a href="https://vercel.com/signup" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline">
                            vercel.com/signup
                            <ExternalLink className="h-3 w-3" />
                          </a> and create a free account
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          2
                        </span>
                        <span className="text-black">
                          Run <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-700">vercel login</code> in your terminal
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          3
                        </span>
                        <span className="text-black">
                          Run <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-700">vercel link</code> to connect your project
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          4
                        </span>
                        <span className="text-black">Add environment variables: From your dashboard, select your project. Select the Settings tab. Go to the Environment Variables section and copy your variables from .env.local to Vercel.</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm">
                        <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ backgroundColor: 'rgba(24, 24, 27, 0.1)', color: '#18181b' }}>
                          5
                        </span>
                        <span className="text-black">
                          To deploy every commit automatically, connect your Git Repository: <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-700">vercel git connect</code>
                          {" "}
                          <a href="https://vercel.com/docs/git" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline">
                            Learn more
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </span>
                      </li>
                    </ol>
                  </div>

                  {/* Footer */}
                  <div className="mt-8 flex items-center justify-between border-t border-zinc-200 pt-6">
                    <button
                      onClick={goToPreviousStep}
                      className="inline-flex items-center justify-center px-4 py-2 text-base font-medium text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-50 transition-colors"
                      style={{ borderRadius: '6px' }}
                    >
                      Back
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={goToNextStep}
                        className="inline-flex items-center justify-center px-4 py-2 text-base font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
                        style={{ borderRadius: '6px' }}
                      >
                        Skip this step
                      </button>
                      <button
                        onClick={goToNextStep}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-base font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                        style={{ borderRadius: '6px' }}
                      >
                        I&apos;ve completed this step
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                </div>
              )}

              {/* Download Tab */}
              {currentTab === "download" && (
                <div>
                  {/* Header section with gradient background */}
                  <div className="border-b border-zinc-100" style={{ padding: '25px', background: 'linear-gradient(to right, rgba(244, 244, 245, 0.5), transparent)' }}>
                    <h2 className="text-2xl font-semibold text-zinc-900">Save</h2>
                    <p className="mt-3 text-base text-black" style={{ lineHeight: '1.7' }}>
                      Your environment configuration is ready. Review the contents below, then save it to <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-sm font-mono">{projectDir ? `${projectDir}/.env.local` : "~/ARI/.env.local"}</code>
                    </p>
                  </div>

                  {/* Content section */}
                  <div className="space-y-6" style={{ padding: '25px' }}>

                  {/* Configuration Summary */}
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-gray-900">Configuration Summary</h3>
                    <div className="space-y-1 text-sm">
                      {/* Required configurations */}
                      <div className="flex items-center gap-2">
                        {formData.databaseUrl ?
                          <Check className="w-4 h-4 text-green-500" /> :
                          <X className="w-4 h-4 text-red-500" />
                        }
                        <span className={!formData.databaseUrl ? "text-red-600" : "text-gray-900"}>
                          Database: {formData.databaseUrl ? "Configured" : "Required - please complete"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {formData.betterAuthSecret ?
                          <Check className="w-4 h-4 text-green-500" /> :
                          <X className="w-4 h-4 text-red-500" />
                        }
                        <span className={!formData.betterAuthSecret ? "text-red-600" : "text-gray-900"}>
                          Auth Secret: {formData.betterAuthSecret ? "Generated" : "Required"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {formData.supabaseUrl && formData.supabaseSecretKey ?
                          <Check className="w-4 h-4 text-green-500" /> :
                          <X className="w-4 h-4 text-red-500" />
                        }
                        <span className={!(formData.supabaseUrl && formData.supabaseSecretKey) ? "text-red-600" : "text-gray-900"}>
                          Supabase API: {formData.supabaseUrl && formData.supabaseSecretKey ? "Configured" : "Required - please complete"}
                        </span>
                      </div>
                      {/* Optional configurations */}
                      <div className="flex items-center gap-2">
                        {formData.adminEmail && formData.adminPassword ?
                          <Check className="w-4 h-4 text-green-500" /> :
                          <X className="w-4 h-4 text-gray-400" />
                        }
                        <span className="text-gray-500">
                          Admin Account: {formData.adminEmail && formData.adminPassword ? "Configured" : "Skipped"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {formData.resendApiKey ?
                          <Check className="w-4 h-4 text-green-500" /> :
                          <X className="w-4 h-4 text-gray-400" />
                        }
                        <span className="text-gray-500">
                          Resend: {formData.resendApiKey ? "Configured" : "Skipped"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {formData.githubToken ?
                          <Check className="w-4 h-4 text-green-500" /> :
                          <X className="w-4 h-4 text-gray-400" />
                        }
                        <span className="text-gray-500">
                          GitHub Sync: {formData.githubToken ? "Configured" : "Skipped"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* .env.local preview */}
                  <CodeBlock
                    language="env"
                    code={generateEnvFileContent()}
                  />

                  {/* Save button */}
                  <Button
                    onClick={handleSaveEnvFile}
                    disabled={!isSupabaseComplete || envSaveStatus === 'saving'}
                    className="w-full rounded-lg bg-green-600 hover:bg-green-700 text-white"
                  >
                    {envSaveStatus === 'saving' ? (
                      <>Saving...</>
                    ) : envSaveStatus === 'saved' ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Saved to {envSavedPath || ".env.local"}
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save .env.local
                      </>
                    )}
                  </Button>

                  {envSaveStatus === 'error' && envSaveError && (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <AlertTitle className="text-red-800">Could not save file</AlertTitle>
                      <AlertDescription className="text-red-700">
                        {envSaveError}. Copy the contents above and manually create <code className="bg-red-100 px-1 rounded text-xs">.env.local</code> in your project directory.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* What is .env.local */}
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <AlertTitle className="text-green-800">What is .env.local?</AlertTitle>
                    <AlertDescription className="text-green-700">
                      The <strong>.env.local</strong> file stores your environment variables (API keys, database credentials, secrets) for local development.
                      This file is automatically ignored by Git, keeping your sensitive data private.
                      {envSaveStatus === 'saved' && " If a previous .env.local existed, it was backed up automatically."}
                    </AlertDescription>
                  </Alert>

                  {envSaveStatus === 'saved' && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
                      <h3 className="text-base font-semibold text-blue-900 mb-2">Setup almost complete</h3>
                      <p className="text-sm text-blue-800 mb-3">
                        Restart your dev server to load the new environment variables, then visit{" "}
                        <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs font-mono">/sign-in</code>.
                        Your admin account and database tables will be created automatically on first sign-in.
                      </p>
                      <div className="mb-3">
                        <CodeBlock language="bash" code={`# In your terminal:\n# 1. Stop the dev server with Ctrl+C\n# 2. Start it again:\npnpm dev`} />
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-8 flex items-center justify-between border-t border-zinc-200 pt-6">
                    <button
                      onClick={goToPreviousStep}
                      className="inline-flex items-center justify-center px-4 py-2 text-base font-medium text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-50 transition-colors"
                      style={{ borderRadius: '6px' }}
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        localStorage.removeItem('ari:welcome:saved')
                        // Clear any stale bootstrap cache from earlier visits
                        // (e.g. a 'no_database' result from before the restart).
                        sessionStorage.removeItem('ari:bootstrap')
                        window.location.href = '/sign-in'
                      }}
                      disabled={envSaveStatus !== 'saved'}
                      className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-base font-medium transition-colors ${
                        envSaveStatus === 'saved'
                          ? 'bg-blue-600 text-white hover:bg-blue-500'
                          : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                      }`}
                      style={{ borderRadius: '6px' }}
                    >
                      I've restarted — sign in
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                </div>
              )}

          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
