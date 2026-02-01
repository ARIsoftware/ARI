"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Switch } from "@/components/ui/switch"
import {
  Database,
  Zap,
  Mail,
  User,
  Download,
  Info,
  ExternalLink,
  CheckCircle,
  Triangle,
  Shield,
  Check,
  X,
  Github,
  GitFork,
  Terminal
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface OnboardingData {
  // GitHub (tracking)
  githubSetupComplete: boolean
  // Supabase (required)
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseSecretKey: string
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

export default function WelcomePage() {
  const [completedLines, setCompletedLines] = useState<string[]>([])
  const [currentLineText, setCurrentLineText] = useState("")
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const [isTyping, setIsTyping] = useState(false)
  const [textOpacity, setTextOpacity] = useState(1)
  const [showBackground, setShowBackground] = useState(false)
  const [showContinue, setShowContinue] = useState(false)
  const [showIntro, setShowIntro] = useState(false)
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
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)

  const sequence = [
    { delay: 300, text: "HELLO." },
    { delay: 300, text: "I am very happy that we can meet." },
    { delay: 300, text: "I am ARI. I am software." },
    { delay: 300, text: "However, I am not like other software." },
    { delay: 300, text: "I am free. Free to grow. Ever expandable. No limits." },
    { delay: 300, text: "I am open source." },
    { delay: 300, text: "I am yours." },
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

            // Show continue link after a short delay
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

  // Calculate progress
  const getProgress = () => {
    let completed = 0
    if (formData.githubSetupComplete) completed++
    if (formData.supabaseUrl && formData.supabaseAnonKey && formData.supabaseSecretKey) completed++
    if (formData.openaiApiKey) completed++
    if (formData.resendApiKey) completed++
    if (formData.vercelSetupComplete) completed++
    if (formData.name || formData.email) completed++
    return Math.round((completed / 6) * 100)
  }

  const generateEnvFileContent = () => {
    const lines: string[] = []

    lines.push("# ARI Application Environment Configuration")
    lines.push("# Generated by onboarding wizard")
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
    setShowContinue(false)
    setTextOpacity(0)
    setTimeout(() => {
      setShowBackground(true)
      setShowIntro(true)
    }, 2000)
  }

  const isSupabaseComplete = formData.supabaseUrl && formData.supabaseAnonKey && formData.supabaseSecretKey

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Text content */}
      <div
        className="absolute top-[70px] left-[70px] space-y-8 transition-opacity transition-duration-[2000ms] z-10"
        style={{ opacity: textOpacity, fontFamily: 'Geist, sans-serif' }}
      >
        {allLines.map((line, index) => {
          const isCurrentLine = index === allLines.length - 1 && isTyping
          const isComplete = index < completedLines.length
          const hasPeriod = line.endsWith(".")
          const textWithoutPeriod = hasPeriod ? line.slice(0, -1) : line
          const isFirstLine = index === 0

          return (
            <div
              key={index}
              className="text-black"
              style={isFirstLine ? { fontSize: '50px', fontWeight: 500 } : { fontSize: '24px', fontWeight: 500 }}
            >
              {textWithoutPeriod}
              {hasPeriod && (
                <>
                  {isCurrentLine || !isComplete ? (
                    <span className="animate-blink">.</span>
                  ) : (
                    <span>.</span>
                  )}
                </>
              )}
              {!hasPeriod && isCurrentLine && (
                <span className="animate-blink">.</span>
              )}
            </div>
          )
        })}

        {/* Continue link */}
        {showContinue && (
          <button
            onClick={handleContinue}
            className="mt-8 text-black hover:underline cursor-pointer transition-opacity duration-500"
            style={{ opacity: showContinue ? 1 : 0, fontSize: '24px', fontWeight: 500 }}
          >
            continue
          </button>
        )}
      </div>

      {/* Background image */}
      {showBackground && (
        <div className="absolute inset-0">
          <Image
            src="/welcome.png"
            alt="Welcome background"
            fill
            className="object-cover"
          />
        </div>
      )}

      {/* Intro Screen */}
      {showIntro && !showOnboarding && (
        <div
          className="absolute inset-0 flex items-start justify-center z-20 transition-opacity duration-500 p-4 pt-12 overflow-y-auto"
          style={{ opacity: showIntro ? 1 : 0 }}
        >
          <Card className="w-full max-w-2xl border border-gray-200" style={{ fontFamily: 'Geist, sans-serif' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl font-medium text-black">Welcome! Let&apos;s get you set up</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <p className="text-gray-500 leading-relaxed">
                Step into a productivity workspace that adjusts to your style, not the other way around. ARI gives you premier personal productivity with full data control and extendability, all in a self-hosted environment built for mastery and modular growth. This is your software, fully programmable and AI native, designed to grow with you as your needs evolve.
              </p>

              <div>
                <h3 className="font-medium text-black mb-1">Build and automate with ease, No coding required</h3>
                <p className="text-gray-500 leading-relaxed">
                  Whether you are crafting custom workflows or integrating multiple AI agents to tackle complex tasks, ARI&apos;s modular design and powerful API gateway make it easy to design exactly what you want. You get robust tools to create your own modules with ease, connect external services, and automate processes without friction, so your projects move faster and smarter.
                </p>
              </div>

              <div>
                <h3 className="font-medium text-black mb-1">Your Productivity Unlocked</h3>
                <p className="text-gray-500 leading-relaxed">
                  With ARI you take command of the software that runs your life. Set up collaborative multi-agent systems, harness AI models through a single endpoint, and compose extensible workspaces that reflect how you think and work. ARI is your productivity and life superpower. ARI helps you do your best work and live your best life.
                </p>
              </div>

              <div className="pt-2 flex justify-center">
                <Button
                  onClick={() => setShowOnboarding(true)}
                  className="px-8"
                >
                  Let&apos;s Go!
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Onboarding Wizard */}
      {showOnboarding && (
        <TooltipProvider>
          {/* Background image for onboarding */}
          <div className="absolute inset-0">
            <Image
              src="/welcome.png"
              alt="Welcome background"
              fill
              className="object-cover"
            />
          </div>
          <div className="absolute inset-0 z-20 overflow-y-auto flex items-start justify-center p-8 pt-12" style={{ fontFamily: 'Geist, sans-serif' }}>
            <Card className="w-full max-w-4xl shadow-lg border border-border/50">
              <CardContent className="p-8 space-y-6">
                {/* Header */}
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-3">Welcome! Let&apos;s get you set up</h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Configure your environment to get ARI running. This step is about preparing your local setup so the application can run smoothly. Nothing here is difficult, but it does require a bit of care and attention to detail. This entire setup process should take around 10 to 20 minutes, depending on your system and familiarity with the tools involved.
                  </p>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between items-center mb-2 text-sm">
                    <span className="font-medium text-foreground">Setup progress</span>
                    <span className="tabular-nums text-muted-foreground">{getProgress()}%</span>
                  </div>
                  <Progress value={getProgress()} className="h-2" />
                </div>

                {/* Tabs */}
                <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
                  <TabsList className="mb-6 grid w-full grid-cols-7 bg-muted/50 rounded-lg p-1">
                    <TabsTrigger
                      value="github"
                      className="text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      GitHub
                    </TabsTrigger>
                    <TabsTrigger
                      value="supabase"
                      className="text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      Supabase
                    </TabsTrigger>
                    <TabsTrigger
                      value="openai"
                      className="text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      OpenAI
                    </TabsTrigger>
                    <TabsTrigger
                      value="resend"
                      className="text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      Resend
                    </TabsTrigger>
                    <TabsTrigger
                      value="vercel"
                      className="text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      Vercel
                    </TabsTrigger>
                    <TabsTrigger
                      value="personal"
                      className="text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      Personal
                    </TabsTrigger>
                    <TabsTrigger
                      value="download"
                      className="text-sm rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      Download
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab 1: GitHub */}
                  <TabsContent value="github" className="space-y-6 mt-0">
                    {/* Header section */}
                    <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
                      <div className="rounded-lg bg-gray-900 p-3">
                        <Github className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h2 className="mb-1 text-lg font-semibold text-foreground">GitHub Setup</h2>
                        <p className="text-sm text-muted-foreground">
                          Create a GitHub repository for your ARI instance. This enables version control, easy deployment to Vercel, and the ability to receive updates.
                        </p>
                      </div>
                    </div>

                    {/* Step 1: Create repo */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                        1
                      </div>
                      <h3 className="text-base font-semibold text-foreground">Create a new repository</h3>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg">
                      <ol className="space-y-3">
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            1
                          </span>
                          <div className="flex-1 pt-0.5 text-sm">
                            <span className="text-foreground">Go to </span>
                            <a href="https://github.com/new" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                              github.com/new
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            2
                          </span>
                          <div className="flex-1 pt-0.5 text-sm text-foreground">
                            Name your repository (e.g., <code className="bg-muted px-1 rounded text-xs">ari</code> or <code className="bg-muted px-1 rounded text-xs">my-ari</code>)
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            3
                          </span>
                          <p className="flex-1 pt-0.5 text-sm text-foreground">Set it to <strong>Private</strong> (recommended) and click <strong>Create repository</strong></p>
                        </li>
                      </ol>
                    </div>

                    {/* Step 2: Push code */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                        2
                      </div>
                      <h3 className="text-base font-semibold text-foreground">Push your code</h3>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                      <p className="text-sm text-foreground">In your project folder, run these commands:</p>
                      <div className="bg-gray-900 text-gray-100 p-3 rounded-md space-y-1">
                        <code className="text-xs block" style={{ fontFamily: 'Geist Mono, monospace' }}>
                          git init
                        </code>
                        <code className="text-xs block" style={{ fontFamily: 'Geist Mono, monospace' }}>
                          git add .
                        </code>
                        <code className="text-xs block" style={{ fontFamily: 'Geist Mono, monospace' }}>
                          git commit -m &quot;Initial commit&quot;
                        </code>
                        <code className="text-xs block" style={{ fontFamily: 'Geist Mono, monospace' }}>
                          git branch -M main
                        </code>
                        <code className="text-xs block" style={{ fontFamily: 'Geist Mono, monospace' }}>
                          git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
                        </code>
                        <code className="text-xs block" style={{ fontFamily: 'Geist Mono, monospace' }}>
                          git push -u origin main
                        </code>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Replace YOUR_USERNAME and YOUR_REPO with your GitHub username and repository name
                      </p>
                    </div>

                    {/* Confirmation */}
                    <div className="flex items-center space-x-2 pt-2">
                      <Switch
                        id="github-setup"
                        checked={formData.githubSetupComplete}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, githubSetupComplete: checked }))}
                      />
                      <Label htmlFor="github-setup">I&apos;ve pushed my code to GitHub</Label>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4">
                      <Button variant="outline" size="sm" className="gap-2 text-xs" asChild>
                        <a href="https://github.com/new" target="_blank" rel="noopener noreferrer">
                          <Github className="h-3.5 w-3.5" />
                          Create Repository
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                      <Button onClick={() => setCurrentTab("supabase")} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                        Continue to Supabase
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Tab 2: Supabase */}
                  <TabsContent value="supabase" className="space-y-6 mt-0">
                    {/* Header section */}
                    <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
                      <div className="rounded-lg bg-accent/10 p-3">
                        <Database className="h-6 w-6 text-accent" />
                      </div>
                      <div className="flex-1">
                        <h2 className="mb-1 text-lg font-semibold text-foreground">Supabase Configuration</h2>
                        <p className="text-sm text-muted-foreground">
                          Supabase provides your database, authentication, and backend services. You&apos;ll need three keys from your Supabase project.
                        </p>
                      </div>
                    </div>

                    {/* Step header */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                        1
                      </div>
                      <h3 className="text-base font-semibold text-foreground">Create a FREE Supabase account</h3>
                    </div>

                    {/* Instructions */}
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <ol className="space-y-3">
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            1
                          </span>
                          <div className="flex-1 pt-0.5 text-sm">
                            <span className="text-foreground">Go to </span>
                            <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                              supabase.com
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <span className="text-foreground"> and create a free account</span>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            2
                          </span>
                          <p className="flex-1 pt-0.5 text-sm text-foreground">Create a new project (free tier)</p>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            3
                          </span>
                          <div className="flex-1 pt-0.5 text-sm">
                            <span className="text-foreground">Go to </span>
                            <a href="https://supabase.com/dashboard/project/_/settings/api" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                              Project Settings → API
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            4
                          </span>
                          <p className="flex-1 pt-0.5 text-sm text-foreground">Copy each key below</p>
                        </li>
                      </ol>
                    </div>

                    {/* Form fields */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="supabaseUrl" className="text-sm font-medium text-foreground">Project URL</Label>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-4 w-4 text-muted-foreground hover:text-foreground" />
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
                          <Label htmlFor="supabaseAnonKey" className="text-sm font-medium text-foreground">Anon/Public Key</Label>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-4 w-4 text-muted-foreground hover:text-foreground" />
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
                          <Label htmlFor="supabaseSecretKey" className="text-sm font-medium text-foreground">Service Role Secret</Label>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-4 w-4 text-muted-foreground hover:text-foreground" />
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

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-4">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => setCurrentTab("github")}>
                            Back
                          </Button>
                          <Button variant="outline" size="sm" className="gap-2 text-xs" asChild>
                            <a href="https://supabase.com/docs/guides/api/api-keys" target="_blank" rel="noopener noreferrer">
                              <Info className="h-3.5 w-3.5" />
                              Docs
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        </div>
                        <Button onClick={() => setCurrentTab("openai")} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                          Continue
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Tab 2: OpenAI */}
                  <TabsContent value="openai" className="space-y-4 mt-4">
                    <Alert className="bg-purple-50 border-purple-200">
                      <Zap className="w-4 h-4" />
                      <AlertTitle>OpenAI Configuration (Optional)</AlertTitle>
                      <AlertDescription>
                        Enable AI-powered features like the /assist chat interface.
                        You can skip this step if you don&apos;t need AI features.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Badge variant="outline">Step 1</Badge>
                        Create a FREE OpenAI account
                      </h3>

                      <ol className="text-sm space-y-2 ml-4 list-decimal list-inside text-muted-foreground">
                        <li>
                          Visit{" "}
                          <a
                            href="https://platform.openai.com/api-keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            OpenAI Platform
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          {" "}(includes free credits)
                        </li>
                        <li>Click &quot;Create new secret key&quot;</li>
                        <li>Copy the key immediately (it won&apos;t be shown again)</li>
                        <li>Paste it below</li>
                      </ol>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="openaiApiKey">OpenAI API Key</Label>
                      <Textarea
                        id="openaiApiKey"
                        value={formData.openaiApiKey}
                        onChange={(e) => setFormData(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                        placeholder="sk-proj-..."
                        className="text-xs min-h-[80px]"
                        style={{ fontFamily: 'Geist Mono, monospace' }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Your key should start with &quot;sk-proj-&quot; or &quot;sk-&quot;
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentTab("supabase")}
                        className="flex-1"
                      >
                        Back
                      </Button>
                      <Button
                        onClick={() => setCurrentTab("resend")}
                        className="flex-1"
                      >
                        {formData.openaiApiKey.trim() ? "Continue" : "Skip"} to Resend
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Tab 3: Resend */}
                  <TabsContent value="resend" className="space-y-6 mt-0">
                    {/* Header section */}
                    <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
                      <div className="rounded-lg bg-green-100 p-3">
                        <Mail className="h-6 w-6 text-green-700" />
                      </div>
                      <div className="flex-1">
                        <h2 className="mb-1 text-lg font-semibold text-foreground">Resend Configuration (Optional)</h2>
                        <p className="text-sm text-muted-foreground">
                          Enable email sending and the <strong>Mail Stream</strong> module. Resend lets you send transactional emails and track their delivery status in real-time.
                        </p>
                      </div>
                    </div>

                    {/* Step 1: API Key */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                        1
                      </div>
                      <h3 className="text-base font-semibold text-foreground">Get your Resend API Key</h3>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg">
                      <ol className="space-y-3">
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            1
                          </span>
                          <div className="flex-1 pt-0.5 text-sm">
                            <span className="text-foreground">Go to </span>
                            <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                              Resend Dashboard → API Keys
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <span className="text-muted-foreground"> (3,000 emails/month free)</span>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            2
                          </span>
                          <p className="flex-1 pt-0.5 text-sm text-foreground">Click <strong>Create API Key</strong> and copy the key</p>
                        </li>
                      </ol>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="resendApiKey" className="text-sm font-medium text-foreground">Resend API Key</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-muted-foreground hover:text-foreground" />
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
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                        2
                      </div>
                      <h3 className="text-base font-semibold text-foreground">Set up Webhook for Mail Stream Module</h3>
                    </div>

                    <Alert className="bg-blue-50 border-blue-200">
                      <Info className="w-4 h-4 text-blue-600" />
                      <AlertTitle className="text-blue-800">Why set up a webhook?</AlertTitle>
                      <AlertDescription className="text-blue-700">
                        The <strong>Mail Stream</strong> module shows you a real-time log of all emails sent from ARI, including their delivery status (sent, delivered, bounced, etc.).
                        Resend sends this status information to your app via webhooks. Without a webhook, Mail Stream won&apos;t receive email events.
                      </AlertDescription>
                    </Alert>

                    <div className="p-4 bg-muted/30 rounded-lg">
                      <ol className="space-y-3">
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            1
                          </span>
                          <div className="flex-1 pt-0.5 text-sm">
                            <span className="text-foreground">Go to </span>
                            <a href="https://resend.com/webhooks" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                              Resend Dashboard → Webhooks
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            2
                          </span>
                          <p className="flex-1 pt-0.5 text-sm text-foreground">Click <strong>Add Webhook</strong></p>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            3
                          </span>
                          <div className="flex-1 pt-0.5 text-sm">
                            <p className="text-foreground mb-2">Enter your webhook endpoint URL:</p>
                            <code className="block bg-gray-900 text-gray-100 px-3 py-2 rounded text-xs" style={{ fontFamily: 'Geist Mono, monospace' }}>
                              https://YOUR-DOMAIN/api/modules/mail-stream/webhook
                            </code>
                            <p className="text-xs text-muted-foreground mt-1">Replace YOUR-DOMAIN with your actual domain</p>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            4
                          </span>
                          <p className="flex-1 pt-0.5 text-sm text-foreground">Select the events you want to track (recommended: <strong>all events</strong>)</p>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            5
                          </span>
                          <p className="flex-1 pt-0.5 text-sm text-foreground">Click <strong>Create</strong> to save the webhook</p>
                        </li>
                      </ol>
                    </div>

                    {/* Step 3: Signing Secret */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                        3
                      </div>
                      <h3 className="text-base font-semibold text-foreground">Copy the Webhook Signing Secret</h3>
                    </div>

                    <Alert className="bg-amber-50 border-amber-200">
                      <Shield className="w-4 h-4 text-amber-600" />
                      <AlertTitle className="text-amber-800">Security: Signing Secret</AlertTitle>
                      <AlertDescription className="text-amber-700">
                        The signing secret verifies that webhook requests genuinely come from Resend, not from malicious actors.
                        ARI uses this secret to validate each incoming webhook before processing it.
                      </AlertDescription>
                    </Alert>

                    <div className="p-4 bg-muted/30 rounded-lg">
                      <ol className="space-y-3">
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            1
                          </span>
                          <p className="flex-1 pt-0.5 text-sm text-foreground">After creating the webhook, click on it to view details</p>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            2
                          </span>
                          <p className="flex-1 pt-0.5 text-sm text-foreground">Copy the <strong>Signing Secret</strong> (starts with <code className="bg-muted px-1 rounded text-xs">whsec_</code>)</p>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            3
                          </span>
                          <p className="flex-1 pt-0.5 text-sm text-foreground">Paste it below</p>
                        </li>
                      </ol>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="resendWebhookSecret" className="text-sm font-medium text-foreground">Webhook Signing Secret</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-muted-foreground hover:text-foreground" />
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

                    {/* Vercel Env Vars Reminder */}
                    <Alert>
                      <Info className="w-4 h-4" />
                      <AlertTitle>Don&apos;t forget Vercel!</AlertTitle>
                      <AlertDescription>
                        After downloading your <code className="bg-muted px-1 rounded text-xs">.env.local</code> file, you&apos;ll also need to add <code className="bg-muted px-1 rounded text-xs">RESEND_API_KEY</code> and <code className="bg-muted px-1 rounded text-xs">RESEND_WEBHOOK_SECRET</code> to your{" "}
                        <a
                          href="https://vercel.com/docs/environment-variables"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline inline-flex items-center gap-1"
                        >
                          Vercel Environment Variables
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        {" "}for production.
                      </AlertDescription>
                    </Alert>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCurrentTab("openai")}>
                          Back
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2 text-xs" asChild>
                          <a href="https://resend.com/docs/dashboard/webhooks/introduction" target="_blank" rel="noopener noreferrer">
                            <Info className="h-3.5 w-3.5" />
                            Webhook Docs
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      </div>
                      <Button onClick={() => setCurrentTab("vercel")} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                        {formData.resendApiKey.trim() ? "Continue" : "Skip"} to Vercel
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Tab 4: Vercel */}
                  <TabsContent value="vercel" className="space-y-4 mt-4">
                    <Alert className="bg-gray-50 border-gray-200">
                      <Triangle className="w-4 h-4" />
                      <AlertTitle>Vercel Deployment (Optional)</AlertTitle>
                      <AlertDescription>
                        Deploy your app to the cloud with Vercel. You can skip this for local development only.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Badge variant="outline">Step 1</Badge>
                        Create a FREE Vercel Hobby account
                      </h3>

                      <ol className="text-sm space-y-2 ml-4 list-decimal list-inside text-muted-foreground">
                        <li>
                          Go to{" "}
                          <a
                            href="https://vercel.com/signup"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            vercel.com/signup
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          {" "}and create a free account
                        </li>
                        <li>
                          Install Vercel CLI:{" "}
                          <code className="bg-gray-100 px-1 rounded text-xs" style={{ fontFamily: 'Geist Mono, monospace' }}>npm install -g vercel</code>
                        </li>
                        <li>
                          Run{" "}
                          <code className="bg-gray-100 px-1 rounded text-xs" style={{ fontFamily: 'Geist Mono, monospace' }}>vercel login</code>
                          {" "}in your terminal
                        </li>
                        <li>
                          Run{" "}
                          <code className="bg-gray-100 px-1 rounded text-xs" style={{ fontFamily: 'Geist Mono, monospace' }}>vercel link</code>
                          {" "}to connect your project
                        </li>
                        <li>Add environment variables in Vercel dashboard</li>
                      </ol>
                    </div>

                    <Alert>
                      <Info className="w-4 h-4" />
                      <AlertDescription>
                        After downloading your .env.local file, you can run{" "}
                        <code className="bg-gray-100 px-1 rounded text-xs" style={{ fontFamily: 'Geist Mono, monospace' }}>vercel env pull</code>
                        {" "}to sync your environment variables.{" "}
                        <a
                          href="https://vercel.com/docs/cli"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          Learn more
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </AlertDescription>
                    </Alert>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="vercel-setup"
                        checked={formData.vercelSetupComplete}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, vercelSetupComplete: checked }))}
                      />
                      <Label htmlFor="vercel-setup">I&apos;ve set up Vercel</Label>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentTab("resend")}
                        className="flex-1"
                      >
                        Back
                      </Button>
                      <Button
                        onClick={() => setCurrentTab("personal")}
                        className="flex-1"
                      >
                        Continue to Personal Details
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Tab 5: Personal Details */}
                  <TabsContent value="personal" className="space-y-4 mt-4">
                    <Alert>
                      <User className="w-4 h-4" />
                      <AlertTitle>Personal Details (Optional)</AlertTitle>
                      <AlertDescription>
                        Tell us about yourself. This information is optional and stored securely in your database.
                      </AlertDescription>
                    </Alert>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                          id="name"
                          placeholder="Your full name"
                          value={formData.name}
                          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
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
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        placeholder="Your job title"
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company">Company Name</Label>
                      <Input
                        id="company"
                        placeholder="Your company name"
                        value={formData.companyName}
                        onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
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
                        <Label htmlFor="city">City</Label>
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
                      <Label htmlFor="linkedin">LinkedIn URL</Label>
                      <Input
                        id="linkedin"
                        placeholder="https://linkedin.com/in/yourprofile"
                        value={formData.linkedinUrl}
                        onChange={(e) => setFormData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="timezone">Timezone</Label>
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

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentTab("vercel")}
                        className="flex-1"
                      >
                        Back
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
                          setCurrentTab("download")
                        }}
                        className="flex-1"
                        disabled={isSavingPreferences}
                      >
                        {isSavingPreferences ? 'Saving...' : 'Continue to Download'}
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Tab 6: Download */}
                  <TabsContent value="download" className="space-y-4 mt-4">
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle className="w-4 h-4" />
                      <AlertTitle>Setup Complete!</AlertTitle>
                      <AlertDescription>
                        Your environment configuration is ready. Download the files and place them
                        in your project root directory.
                      </AlertDescription>
                    </Alert>

                    {/* Summary */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm">Configuration Summary</h3>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          {isSupabaseComplete ?
                            <Check className="w-4 h-4 text-green-500" /> :
                            <X className="w-4 h-4 text-red-500" />
                          }
                          <span className={!isSupabaseComplete ? "text-red-600" : ""}>
                            Supabase: {isSupabaseComplete ? "Configured" : "Required - please complete"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {formData.openaiApiKey ?
                            <Check className="w-4 h-4 text-green-500" /> :
                            <X className="w-4 h-4 text-gray-400" />
                          }
                          <span className="text-muted-foreground">
                            OpenAI: {formData.openaiApiKey ? "Configured" : "Skipped"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {formData.resendApiKey ?
                            <Check className="w-4 h-4 text-green-500" /> :
                            <X className="w-4 h-4 text-gray-400" />
                          }
                          <span className="text-muted-foreground">
                            Resend: {formData.resendApiKey ? "Configured" : "Skipped"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* .env.local preview */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Badge variant="outline">File 1</Badge>
                        .env.local
                      </h3>
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto max-h-48">
                        <pre className="text-xs whitespace-pre-wrap" style={{ fontFamily: 'Geist Mono, monospace' }}>
                          {generateEnvFileContent()}
                        </pre>
                      </div>
                    </div>

                    {/* Next steps */}
                    <Alert>
                      <Info className="w-4 h-4" />
                      <AlertTitle>Next Steps</AlertTitle>
                      <AlertDescription>
                        <ol className="list-decimal list-inside space-y-1 text-sm mt-2">
                          <li>Download the file(s) using the button(s) below</li>
                          <li>Place them in your project root directory (next to package.json)</li>
                          <li>Restart your development server</li>
                          <li>Your application is ready to use!</li>
                        </ol>
                      </AlertDescription>
                    </Alert>

                    {/* Download button */}
                    <Button
                      onClick={handleDownloadEnvFile}
                      disabled={!isSupabaseComplete}
                      className="w-full bg-green-600 hover:bg-green-700"
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

                    <Button
                      variant="outline"
                      onClick={() => setCurrentTab("personal")}
                      className="w-full"
                    >
                      Back to Personal Details
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}
