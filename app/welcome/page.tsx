"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Database,
  Zap,
  Mail,
  User,
  Download,
  Info,
  ExternalLink,
  CheckCircle,
  Shield,
  Check,
  X,
  Github,
  ArrowRight
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StepIndicator } from "./components/step-indicator"
import { CodeBlock } from "./components/code-block"

interface OnboardingData {
  // GitHub (tracking)
  githubSetupComplete: boolean
  // Supabase (required)
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseSecretKey: string
  databaseUrl: string
  // Better Auth (required)
  betterAuthSecret: string
  // OpenAI (optional)
  openaiApiKey: string
  // Resend (optional)
  resendApiKey: string
  resendWebhookSecret: string
  // Vercel (tracking)
  vercelSetupComplete: boolean
  // Personal (optional)
  name: string
  email: string
  title: string
  companyName: string
  country: string
  city: string
  linkedinUrl: string
  timezone: string
}

// Generate a cryptographically secure random string for BETTER_AUTH_SECRET
const generateAuthSecret = () => {
  const array = new Uint8Array(32)
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array)
  }
  return btoa(String.fromCharCode(...array))
}

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

const STEP_ORDER = ["github", "supabase", "openai", "resend", "vercel", "personal", "download"]

export default function WelcomePage() {
  const [completedLines, setCompletedLines] = useState<string[]>([])
  const [currentLineText, setCurrentLineText] = useState("")
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const [isTyping, setIsTyping] = useState(false)
  const [showContinue, setShowContinue] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const [currentTab, setCurrentTab] = useState("github")
  // Auto-detect browser timezone
  const getDefaultTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return 'UTC'
    }
  }

  const [formData, setFormData] = useState<OnboardingData>({
    githubSetupComplete: false,
    supabaseUrl: "",
    supabaseAnonKey: "",
    supabaseSecretKey: "",
    databaseUrl: "",
    betterAuthSecret: "",
    openaiApiKey: "",
    resendApiKey: "",
    resendWebhookSecret: "",
    vercelSetupComplete: false,
    name: "",
    email: "",
    title: "",
    companyName: "",
    country: "",
    city: "",
    linkedinUrl: "",
    timezone: getDefaultTimezone(),
  })

  // Generate BETTER_AUTH_SECRET on mount
  useEffect(() => {
    if (!formData.betterAuthSecret) {
      setFormData(prev => ({ ...prev, betterAuthSecret: generateAuthSecret() }))
    }
  }, [])
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)

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

            // Show continue button after a short delay
            const continueTimeout = setTimeout(() => {
              setShowContinue(true)
            }, 500)
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

  const allLines = [...completedLines]
  if (currentLineText) {
    allLines.push(currentLineText)
  }

  const generateEnvFileContent = () => {
    const lines: string[] = []

    lines.push("# ARI Application Environment Configuration")
    lines.push("# Generated by onboarding wizard")
    lines.push("")

    lines.push("# Better Auth Configuration (Required)")
    lines.push(`BETTER_AUTH_SECRET=${formData.betterAuthSecret}`)
    lines.push("BETTER_AUTH_URL=http://localhost:3000")
    lines.push("")

    lines.push("# Database Configuration (Required)")
    lines.push(`DATABASE_URL=${formData.databaseUrl}`)
    lines.push("")

    lines.push("# Supabase Configuration")
    lines.push(`NEXT_PUBLIC_SUPABASE_URL=${formData.supabaseUrl}`)
    lines.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${formData.supabaseAnonKey}`)
    lines.push(`SUPABASE_SECRET_KEY=${formData.supabaseSecretKey}`)
    lines.push("")

    lines.push("# Top Bar Customization (optional)")
    lines.push("# NEXT_PUBLIC_TOP_BAR_MESSAGE=\"Custom Message\"")
    lines.push("# NEXT_PUBLIC_TOP_BAR_COLOR=\"#c00\"")
    lines.push("")

    if (formData.openaiApiKey.trim()) {
      lines.push("# OpenAI API Integration")
      lines.push(`OPENAI_API_KEY=${formData.openaiApiKey}`)
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

    return lines.join("\n")
  }

  const handleDownloadEnvFile = () => {
    const content = generateEnvFileContent()
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = ".env.local"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
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
        style={{ fontFamily: 'Geist, sans-serif', padding: '70px 0 0 70px' }}
      >
        {/* Typed lines */}
        <div className="space-y-6">
          {allLines.map((line, index) => {
            const isFirstLine = index === 0
            const isCurrentLine = index === allLines.length - 1 && isTyping

            return (
              <p
                key={index}
                className={isFirstLine ? "text-6xl font-bold text-black mb-8" : "text-2xl text-black"}
                style={isFirstLine ? { marginBottom: '32px' } : {}}
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
              className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg text-base"
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
      <div
        className="min-h-screen bg-[#f9fafe] overflow-y-auto flex items-start justify-center p-8 pt-12"
        style={{ fontFamily: 'Geist, sans-serif' }}
      >
        <div className="w-full max-w-4xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-normal tracking-tight text-gray-900 mb-4">
              Configure ARI
            </h1>
            <p className="text-base leading-relaxed text-gray-600">
              Configure your environment to get ARI running. This step is about preparing your local setup so the application can run smoothly. Nothing here is difficult, but it does require a bit of care and attention to detail. This entire setup process should take around 10 to 20 minutes, depending on your system and familiarity with the tools involved.
            </p>
          </div>

          {/* Step Indicator */}
          <StepIndicator currentStep={currentTab} onStepClick={setCurrentTab} />

          {/* Content Card */}
          <Card className="w-full bg-white border border-gray-200 rounded-2xl shadow-sm">
            <CardContent className="p-8">
              {/* GitHub Tab */}
              {currentTab === "github" && (
                <div className="space-y-6">
                  {/* Header section */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                      <Github className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">GitHub Setup</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Create a GitHub repository for your ARI instance. This enables version control, easy deployment to Vercel, and the ability to receive updates.
                      </p>
                    </div>
                  </div>

                  {/* Step 1: Create repo */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      1
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Create a new repository</h3>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <ol className="space-y-3">
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          1
                        </span>
                        <div className="flex-1 pt-0.5 text-sm">
                          <span className="text-gray-900">Go to </span>
                          <a href="https://github.com/new" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-900 hover:underline">
                            github.com/new
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          2
                        </span>
                        <div className="flex-1 pt-0.5 text-sm text-gray-900">
                          Name your repository (e.g., <code className="bg-gray-200 px-1 rounded text-xs">ari</code> or <code className="bg-gray-200 px-1 rounded text-xs">my-ari</code>)
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          3
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Set it to <strong>Private</strong> (recommended) and click <strong>Create repository</strong></p>
                      </li>
                    </ol>
                  </div>

                  {/* Step 2: Push code */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      2
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Push your code</h3>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm text-gray-900">In your project folder, run these commands:</p>
                    <CodeBlock
                      language="bash"
                      code={`git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main`}
                    />
                    <p className="text-xs text-gray-500">
                      Replace <code className="bg-gray-200 px-1 rounded text-xs">YOUR_USERNAME</code> and <code className="bg-gray-200 px-1 rounded text-xs">YOUR_REPO</code> with your GitHub username and repository name
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
                    <Button
                      variant="outline"
                      onClick={goToPreviousStep}
                      className="border-gray-300"
                      disabled
                    >
                      Back
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        onClick={goToNextStep}
                        className="border-gray-300"
                      >
                        Skip this step
                      </Button>
                      <Button
                        onClick={goToNextStep}
                        className="bg-gray-900 hover:bg-gray-800 text-white gap-2"
                      >
                        I&apos;ve completed this step
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Supabase Tab */}
              {currentTab === "supabase" && (
                <div className="space-y-6">
                  {/* Header section */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                      <Database className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Database &amp; Authentication</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Configure your PostgreSQL database connection and authentication. You&apos;ll need API keys, the database connection string, and we&apos;ll generate a secure auth secret for you.
                      </p>
                    </div>
                  </div>

                  {/* Step 1 */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      1
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Create a FREE Supabase account</h3>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <ol className="space-y-3">
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          1
                        </span>
                        <div className="flex-1 pt-0.5 text-sm">
                          <span className="text-gray-900">Go to </span>
                          <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-900 hover:underline">
                            supabase.com
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <span className="text-gray-900"> and create a free account</span>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          2
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Create a new project (free tier)</p>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          3
                        </span>
                        <div className="flex-1 pt-0.5 text-sm">
                          <span className="text-gray-900">Go to </span>
                          <a href="https://supabase.com/dashboard/project/_/settings/api" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-900 hover:underline">
                            Project Settings &rarr; API
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          4
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Copy each key below</p>
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
                        <Label htmlFor="supabaseAnonKey" className="text-sm font-medium text-gray-900">Anon/Public Key</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">Also called &quot;anon&quot; or &quot;publishable&quot; key. Safe to use in browser.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="supabaseAnonKey"
                        value={formData.supabaseAnonKey}
                        onChange={(e) => setFormData(prev => ({ ...prev, supabaseAnonKey: e.target.value }))}
                        placeholder="eyJhbGci ..."
                        className="text-sm"
                        style={{ fontFamily: 'Geist Mono, monospace' }}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="supabaseSecretKey" className="text-sm font-medium text-gray-900">Service Role Secret</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">Server-side only key that bypasses Row Level Security. Keep this secret!</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="supabaseSecretKey"
                        value={formData.supabaseSecretKey}
                        onChange={(e) => setFormData(prev => ({ ...prev, supabaseSecretKey: e.target.value }))}
                        placeholder="eyJhbGci ..."
                        className="text-sm"
                        style={{ fontFamily: 'Geist Mono, monospace' }}
                      />
                    </div>
                  </div>

                  {/* Step 2: Database Connection */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      2
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Get your Database Connection String</h3>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <ol className="space-y-3">
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          1
                        </span>
                        <div className="flex-1 pt-0.5 text-sm">
                          <span className="text-gray-900">Go to </span>
                          <a href="https://supabase.com/dashboard/project/_/settings/database" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-900 hover:underline">
                            Project Settings &rarr; Database
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          2
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Scroll to <strong>Connection string</strong> section</p>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          3
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Select <strong>URI</strong> tab and copy the connection string</p>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          4
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Replace <code className="bg-gray-200 px-1 rounded text-xs">[YOUR-PASSWORD]</code> with your database password</p>
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
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      3
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Authentication Secret</h3>
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
                          className="border-gray-300"
                        >
                          Regenerate
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
                    <Button
                      variant="outline"
                      onClick={goToPreviousStep}
                      className="border-gray-300"
                    >
                      Back
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        onClick={goToNextStep}
                        className="border-gray-300"
                      >
                        Skip this step
                      </Button>
                      <Button
                        onClick={goToNextStep}
                        className="bg-gray-900 hover:bg-gray-800 text-white gap-2"
                      >
                        I&apos;ve completed this step
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* OpenAI Tab */}
              {currentTab === "openai" && (
                <div className="space-y-6">
                  {/* Header section */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                      <Zap className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">OpenAI Configuration</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Enable AI-powered features like the /assist chat interface. You can skip this step if you don&apos;t need AI features.
                      </p>
                    </div>
                  </div>

                  <Alert className="bg-purple-50 border-purple-200">
                    <Zap className="w-4 h-4 text-purple-600" />
                    <AlertTitle className="text-purple-800">Optional</AlertTitle>
                    <AlertDescription className="text-purple-700">
                      OpenAI integration is optional. Skip this step if you don&apos;t need AI-powered features.
                    </AlertDescription>
                  </Alert>

                  {/* Step 1 */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      1
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Create a FREE OpenAI account</h3>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <ol className="space-y-3">
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          1
                        </span>
                        <div className="flex-1 pt-0.5 text-sm">
                          <span className="text-gray-900">Visit </span>
                          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-900 hover:underline">
                            OpenAI Platform
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <span className="text-gray-500"> (includes free credits)</span>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          2
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Click <strong>&quot;Create new secret key&quot;</strong></p>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          3
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Copy the key immediately (it won&apos;t be shown again)</p>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          4
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Paste it below</p>
                      </li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="openaiApiKey" className="text-sm font-medium text-gray-900">OpenAI API Key</Label>
                    <Textarea
                      id="openaiApiKey"
                      value={formData.openaiApiKey}
                      onChange={(e) => setFormData(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                      placeholder="sk-proj-..."
                      className="text-sm min-h-[80px]"
                      style={{ fontFamily: 'Geist Mono, monospace' }}
                    />
                    <p className="text-xs text-gray-500">
                      Your key should start with &quot;sk-proj-&quot; or &quot;sk-&quot;
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
                    <Button
                      variant="outline"
                      onClick={goToPreviousStep}
                      className="border-gray-300"
                    >
                      Back
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        onClick={goToNextStep}
                        className="border-gray-300"
                      >
                        Skip this step
                      </Button>
                      <Button
                        onClick={goToNextStep}
                        className="bg-gray-900 hover:bg-gray-800 text-white gap-2"
                      >
                        I&apos;ve completed this step
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Resend Tab */}
              {currentTab === "resend" && (
                <div className="space-y-6">
                  {/* Header section */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                      <Mail className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Resend Configuration</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Enable email sending and the <strong>Mail Stream</strong> module. Resend lets you send transactional emails and track their delivery status in real-time.
                      </p>
                    </div>
                  </div>

                  {/* Step 1: API Key */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      1
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Get your Resend API Key</h3>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <ol className="space-y-3">
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          1
                        </span>
                        <div className="flex-1 pt-0.5 text-sm">
                          <span className="text-gray-900">Go to </span>
                          <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-900 hover:underline">
                            Resend Dashboard &rarr; API Keys
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <span className="text-gray-500"> (3,000 emails/month free)</span>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          2
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Click <strong>Create API Key</strong> and copy the key</p>
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

                  {/* Step 2: Webhook Setup */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      2
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Set up Webhook for Mail Stream Module</h3>
                  </div>

                  <Alert className="bg-blue-50 border-blue-200">
                    <Info className="w-4 h-4 text-blue-600" />
                    <AlertTitle className="text-blue-800">Why set up a webhook?</AlertTitle>
                    <AlertDescription className="text-blue-700">
                      The <strong>Mail Stream</strong> module shows you a real-time log of all emails sent from ARI, including their delivery status (sent, delivered, bounced, etc.).
                      Resend sends this status information to your app via webhooks. Without a webhook, Mail Stream won&apos;t receive email events.
                    </AlertDescription>
                  </Alert>

                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <ol className="space-y-3">
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          1
                        </span>
                        <div className="flex-1 pt-0.5 text-sm">
                          <span className="text-gray-900">Go to </span>
                          <a href="https://resend.com/webhooks" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-900 hover:underline">
                            Resend Dashboard &rarr; Webhooks
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          2
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Click <strong>Add Webhook</strong></p>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          3
                        </span>
                        <div className="flex-1 pt-0.5 text-sm">
                          <p className="text-gray-900 mb-2">Enter your webhook endpoint URL:</p>
                          <CodeBlock
                            language="url"
                            code="https://YOUR-DOMAIN/api/modules/mail-stream/webhook"
                          />
                          <p className="text-xs text-gray-500 mt-2">Replace YOUR-DOMAIN with your actual domain</p>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          4
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Select the events you want to track (recommended: <strong>all events</strong>)</p>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          5
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Click <strong>Create</strong> to save the webhook</p>
                      </li>
                    </ol>
                  </div>

                  {/* Step 3: Signing Secret */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      3
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Copy the Webhook Signing Secret</h3>
                  </div>

                  <Alert className="bg-amber-50 border-amber-200">
                    <Shield className="w-4 h-4 text-amber-600" />
                    <AlertTitle className="text-amber-800">Security: Signing Secret</AlertTitle>
                    <AlertDescription className="text-amber-700">
                      The signing secret verifies that webhook requests genuinely come from Resend, not from malicious actors.
                      ARI uses this secret to validate each incoming webhook before processing it.
                    </AlertDescription>
                  </Alert>

                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <ol className="space-y-3">
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          1
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">After creating the webhook, click on it to view details</p>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          2
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Copy the <strong>Signing Secret</strong> (starts with <code className="bg-gray-200 px-1 rounded text-xs">whsec_</code>)</p>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          3
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Paste it below</p>
                      </li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="resendWebhookSecret" className="text-sm font-medium text-gray-900">Webhook Signing Secret</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs max-w-xs">Used to verify webhook signatures (starts with whsec_)</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="resendWebhookSecret"
                      value={formData.resendWebhookSecret}
                      onChange={(e) => setFormData(prev => ({ ...prev, resendWebhookSecret: e.target.value }))}
                      placeholder="whsec_..."
                      className="text-sm"
                      style={{ fontFamily: 'Geist Mono, monospace' }}
                    />
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
                    <Button
                      variant="outline"
                      onClick={goToPreviousStep}
                      className="border-gray-300"
                    >
                      Back
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        onClick={goToNextStep}
                        className="border-gray-300"
                      >
                        Skip this step
                      </Button>
                      <Button
                        onClick={goToNextStep}
                        className="bg-gray-900 hover:bg-gray-800 text-white gap-2"
                      >
                        I&apos;ve completed this step
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Vercel Tab */}
              {currentTab === "vercel" && (
                <div className="space-y-6">
                  {/* Header section */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-white">
                        <path d="M24 22.525H0l12-21.05 12 21.05z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Vercel Deployment</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Deploy your app to the cloud with Vercel. You can skip this for local development only.
                      </p>
                    </div>
                  </div>

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
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      1
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Create a FREE Vercel Hobby account</h3>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <ol className="space-y-3">
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          1
                        </span>
                        <div className="flex-1 pt-0.5 text-sm">
                          <span className="text-gray-900">Go to </span>
                          <a href="https://vercel.com/signup" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-900 hover:underline">
                            vercel.com/signup
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <span className="text-gray-900"> and create a free account</span>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          2
                        </span>
                        <div className="flex-1 pt-0.5 text-sm text-gray-900">
                          Install Vercel CLI: <code className="bg-gray-200 px-1 rounded text-xs" style={{ fontFamily: 'Geist Mono, monospace' }}>npm install -g vercel</code>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          3
                        </span>
                        <div className="flex-1 pt-0.5 text-sm text-gray-900">
                          Run <code className="bg-gray-200 px-1 rounded text-xs" style={{ fontFamily: 'Geist Mono, monospace' }}>vercel login</code> in your terminal
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          4
                        </span>
                        <div className="flex-1 pt-0.5 text-sm text-gray-900">
                          Run <code className="bg-gray-200 px-1 rounded text-xs" style={{ fontFamily: 'Geist Mono, monospace' }}>vercel link</code> to connect your project
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                          5
                        </span>
                        <p className="flex-1 pt-0.5 text-sm text-gray-900">Add environment variables in Vercel dashboard</p>
                      </li>
                    </ol>
                  </div>

                  <Alert>
                    <Info className="w-4 h-4" />
                    <AlertDescription className="text-gray-700">
                      After downloading your .env.local file, you can run{" "}
                      <code className="bg-gray-200 px-1 rounded text-xs" style={{ fontFamily: 'Geist Mono, monospace' }}>vercel env pull</code>
                      {" "}to sync your environment variables.{" "}
                      <a
                        href="https://vercel.com/docs/cli"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-900 hover:underline inline-flex items-center gap-1"
                      >
                        Learn more
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </AlertDescription>
                  </Alert>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
                    <Button
                      variant="outline"
                      onClick={goToPreviousStep}
                      className="border-gray-300"
                    >
                      Back
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        onClick={goToNextStep}
                        className="border-gray-300"
                      >
                        Skip this step
                      </Button>
                      <Button
                        onClick={goToNextStep}
                        className="bg-gray-900 hover:bg-gray-800 text-white gap-2"
                      >
                        I&apos;ve completed this step
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Personal Tab */}
              {currentTab === "personal" && (
                <div className="space-y-6">
                  {/* Header section */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Personal Details</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Tell us about yourself. This information is optional and stored securely in your database.
                      </p>
                    </div>
                  </div>

                  <Alert className="bg-gray-50 border-gray-200">
                    <User className="w-4 h-4 text-gray-600" />
                    <AlertTitle className="text-gray-800">Optional</AlertTitle>
                    <AlertDescription className="text-gray-700">
                      Personal details are optional. Skip this step if you prefer not to share this information.
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium text-gray-900">Name</Label>
                      <Input
                        id="name"
                        placeholder="Your full name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium text-gray-900">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-sm font-medium text-gray-900">Title</Label>
                    <Input
                      id="title"
                      placeholder="Your job title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company" className="text-sm font-medium text-gray-900">Company Name</Label>
                    <Input
                      id="company"
                      placeholder="Your company name"
                      value={formData.companyName}
                      onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="country" className="text-sm font-medium text-gray-900">Country</Label>
                      <Select
                        value={formData.country}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, country: value, city: "" }))}
                      >
                        <SelectTrigger id="country">
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="australia">Australia</SelectItem>
                          <SelectItem value="canada">Canada</SelectItem>
                          <SelectItem value="germany">Germany</SelectItem>
                          <SelectItem value="france">France</SelectItem>
                          <SelectItem value="india">India</SelectItem>
                          <SelectItem value="israel">Israel</SelectItem>
                          <SelectItem value="japan">Japan</SelectItem>
                          <SelectItem value="netherlands">Netherlands</SelectItem>
                          <SelectItem value="singapore">Singapore</SelectItem>
                          <SelectItem value="south-africa">South Africa</SelectItem>
                          <SelectItem value="spain">Spain</SelectItem>
                          <SelectItem value="uk">United Kingdom</SelectItem>
                          <SelectItem value="usa">United States</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city" className="text-sm font-medium text-gray-900">City</Label>
                      <Select
                        value={formData.city}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, city: value }))}
                        disabled={!formData.country}
                      >
                        <SelectTrigger id="city">
                          <SelectValue placeholder={formData.country ? "Select city" : "Select country first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {formData.country === "australia" && (
                            <>
                              <SelectItem value="sydney">Sydney</SelectItem>
                              <SelectItem value="melbourne">Melbourne</SelectItem>
                              <SelectItem value="brisbane">Brisbane</SelectItem>
                              <SelectItem value="perth">Perth</SelectItem>
                            </>
                          )}
                          {formData.country === "canada" && (
                            <>
                              <SelectItem value="toronto">Toronto</SelectItem>
                              <SelectItem value="vancouver">Vancouver</SelectItem>
                              <SelectItem value="montreal">Montreal</SelectItem>
                              <SelectItem value="calgary">Calgary</SelectItem>
                            </>
                          )}
                          {formData.country === "germany" && (
                            <>
                              <SelectItem value="berlin">Berlin</SelectItem>
                              <SelectItem value="munich">Munich</SelectItem>
                              <SelectItem value="frankfurt">Frankfurt</SelectItem>
                              <SelectItem value="hamburg">Hamburg</SelectItem>
                            </>
                          )}
                          {formData.country === "france" && (
                            <>
                              <SelectItem value="paris">Paris</SelectItem>
                              <SelectItem value="lyon">Lyon</SelectItem>
                              <SelectItem value="marseille">Marseille</SelectItem>
                              <SelectItem value="toulouse">Toulouse</SelectItem>
                            </>
                          )}
                          {formData.country === "india" && (
                            <>
                              <SelectItem value="mumbai">Mumbai</SelectItem>
                              <SelectItem value="delhi">Delhi</SelectItem>
                              <SelectItem value="bangalore">Bangalore</SelectItem>
                              <SelectItem value="hyderabad">Hyderabad</SelectItem>
                            </>
                          )}
                          {formData.country === "israel" && (
                            <>
                              <SelectItem value="tel-aviv">Tel Aviv</SelectItem>
                              <SelectItem value="jerusalem">Jerusalem</SelectItem>
                              <SelectItem value="haifa">Haifa</SelectItem>
                              <SelectItem value="herzliya">Herzliya</SelectItem>
                            </>
                          )}
                          {formData.country === "japan" && (
                            <>
                              <SelectItem value="tokyo">Tokyo</SelectItem>
                              <SelectItem value="osaka">Osaka</SelectItem>
                              <SelectItem value="kyoto">Kyoto</SelectItem>
                              <SelectItem value="yokohama">Yokohama</SelectItem>
                            </>
                          )}
                          {formData.country === "netherlands" && (
                            <>
                              <SelectItem value="amsterdam">Amsterdam</SelectItem>
                              <SelectItem value="rotterdam">Rotterdam</SelectItem>
                              <SelectItem value="the-hague">The Hague</SelectItem>
                              <SelectItem value="utrecht">Utrecht</SelectItem>
                            </>
                          )}
                          {formData.country === "singapore" && (
                            <>
                              <SelectItem value="singapore-central">Central</SelectItem>
                              <SelectItem value="singapore-east">East</SelectItem>
                              <SelectItem value="singapore-west">West</SelectItem>
                              <SelectItem value="singapore-north">North</SelectItem>
                            </>
                          )}
                          {formData.country === "south-africa" && (
                            <>
                              <SelectItem value="johannesburg">Johannesburg</SelectItem>
                              <SelectItem value="cape-town">Cape Town</SelectItem>
                              <SelectItem value="durban">Durban</SelectItem>
                              <SelectItem value="pretoria">Pretoria</SelectItem>
                            </>
                          )}
                          {formData.country === "spain" && (
                            <>
                              <SelectItem value="madrid">Madrid</SelectItem>
                              <SelectItem value="barcelona">Barcelona</SelectItem>
                              <SelectItem value="valencia">Valencia</SelectItem>
                              <SelectItem value="seville">Seville</SelectItem>
                            </>
                          )}
                          {formData.country === "uk" && (
                            <>
                              <SelectItem value="london">London</SelectItem>
                              <SelectItem value="manchester">Manchester</SelectItem>
                              <SelectItem value="birmingham">Birmingham</SelectItem>
                              <SelectItem value="edinburgh">Edinburgh</SelectItem>
                            </>
                          )}
                          {formData.country === "usa" && (
                            <>
                              <SelectItem value="new-york">New York</SelectItem>
                              <SelectItem value="san-francisco">San Francisco</SelectItem>
                              <SelectItem value="los-angeles">Los Angeles</SelectItem>
                              <SelectItem value="chicago">Chicago</SelectItem>
                              <SelectItem value="austin">Austin</SelectItem>
                              <SelectItem value="seattle">Seattle</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linkedin" className="text-sm font-medium text-gray-900">LinkedIn URL</Label>
                    <Input
                      id="linkedin"
                      placeholder="https://linkedin.com/in/yourprofile"
                      value={formData.linkedinUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="timezone" className="text-sm font-medium text-gray-900">Timezone</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs max-w-xs">Your timezone is used for scheduling features like automatic backups.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select
                      value={formData.timezone}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, timezone: value }))}
                    >
                      <SelectTrigger id="timezone">
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

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
                    <Button
                      variant="outline"
                      onClick={goToPreviousStep}
                      className="border-gray-300"
                    >
                      Back
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        onClick={goToNextStep}
                        className="border-gray-300"
                      >
                        Skip this step
                      </Button>
                      <Button
                        onClick={async () => {
                          // Save preferences to database
                          if (formData.name || formData.email || formData.timezone) {
                            setIsSavingPreferences(true)
                            try {
                              await fetch('/api/user-preferences', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  name: formData.name || null,
                                  email: formData.email || null,
                                  title: formData.title || null,
                                  company_name: formData.companyName || null,
                                  country: formData.country || null,
                                  city: formData.city || null,
                                  linkedin_url: formData.linkedinUrl || null,
                                  timezone: formData.timezone,
                                }),
                              })
                            } catch (error) {
                              console.error('Failed to save preferences:', error)
                            } finally {
                              setIsSavingPreferences(false)
                            }
                          }
                          goToNextStep()
                        }}
                        className="bg-gray-900 hover:bg-gray-800 text-white gap-2"
                        disabled={isSavingPreferences}
                      >
                        {isSavingPreferences ? 'Saving...' : "I've completed this step"}
                        {!isSavingPreferences && <ArrowRight className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Download Tab */}
              {currentTab === "download" && (
                <div className="space-y-6">
                  {/* Header section */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                      <Download className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Download &amp; Finish</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Your environment configuration is ready. Download the files and place them in your project root directory.
                      </p>
                    </div>
                  </div>

                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <AlertTitle className="text-green-800">Setup Complete!</AlertTitle>
                    <AlertDescription className="text-green-700">
                      Your environment configuration is ready. Download the files and place them
                      in your project root directory.
                    </AlertDescription>
                  </Alert>

                  {/* Summary */}
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
                        {formData.openaiApiKey ?
                          <Check className="w-4 h-4 text-green-500" /> :
                          <X className="w-4 h-4 text-gray-400" />
                        }
                        <span className="text-gray-500">
                          OpenAI: {formData.openaiApiKey ? "Configured" : "Skipped"}
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
                    </div>
                  </div>

                  {/* .env.local preview */}
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-gray-900">.env.local</h3>
                    <CodeBlock
                      language="env"
                      code={generateEnvFileContent()}
                    />
                  </div>

                  {/* Next steps */}
                  <Alert>
                    <Info className="w-4 h-4" />
                    <AlertTitle className="text-gray-800">Next Steps</AlertTitle>
                    <AlertDescription className="text-gray-700">
                      <ol className="list-decimal list-inside space-y-1 text-sm mt-2">
                        <li>Download the file(s) using the button(s) below</li>
                        <li>Place them in your project root directory (next to package.json)</li>
                        <li>Restart your development server</li>
                        <li>Your application is ready to use!</li>
                      </ol>
                      <p className="mt-2 text-xs text-gray-500">
                        <strong>For production:</strong> Update <code className="bg-gray-200 px-1 rounded">BETTER_AUTH_URL</code> to your production domain in Vercel environment variables.
                      </p>
                    </AlertDescription>
                  </Alert>

                  {/* Download button */}
                  <Button
                    onClick={handleDownloadEnvFile}
                    disabled={!isSupabaseComplete}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download .env.local
                  </Button>

                  {/* Security warning */}
                  <Alert variant="destructive">
                    <Shield className="w-4 h-4" />
                    <AlertTitle>Security Warning</AlertTitle>
                    <AlertDescription className="text-xs">
                      Your keys are stored in browser memory only and will be lost when you
                      close this page. The .env.local file should NEVER be committed to git.
                      Make sure it&apos;s listed in your .gitignore file.
                    </AlertDescription>
                  </Alert>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
                    <Button
                      variant="outline"
                      onClick={goToPreviousStep}
                      className="border-gray-300"
                    >
                      Back
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={handleDownloadEnvFile}
                        disabled={!isSupabaseComplete}
                        className="bg-gray-900 hover:bg-gray-800 text-white gap-2"
                      >
                        Finish Setup
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  )
}
