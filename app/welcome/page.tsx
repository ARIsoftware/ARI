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
  X
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface OnboardingData {
  // Supabase (required)
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseSecretKey: string
  // OpenAI (optional)
  openaiApiKey: string
  // Resend (optional)
  resendApiKey: string
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
}

export default function WelcomePage() {
  const [completedLines, setCompletedLines] = useState<string[]>([])
  const [currentLineText, setCurrentLineText] = useState("")
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const [isTyping, setIsTyping] = useState(false)
  const [textOpacity, setTextOpacity] = useState(1)
  const [showBackground, setShowBackground] = useState(true)
  const [showContinue, setShowContinue] = useState(false)
  const [showIntro, setShowIntro] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const [currentTab, setCurrentTab] = useState("supabase")
  const [formData, setFormData] = useState<OnboardingData>({
    supabaseUrl: "",
    supabaseAnonKey: "",
    supabaseSecretKey: "",
    openaiApiKey: "",
    resendApiKey: "",
    vercelSetupComplete: false,
    name: "",
    email: "",
    title: "",
    companyName: "",
    country: "",
    city: "",
    linkedinUrl: "",
  })

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
    if (formData.supabaseUrl && formData.supabaseAnonKey && formData.supabaseSecretKey) completed++
    if (formData.openaiApiKey) completed++
    if (formData.resendApiKey) completed++
    if (formData.vercelSetupComplete) completed++
    if (formData.name || formData.email) completed++
    return Math.round((completed / 5) * 100)
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
      setShowIntro(true)
    }, 2000)
  }

  const isSupabaseComplete = formData.supabaseUrl && formData.supabaseAnonKey && formData.supabaseSecretKey

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Text content */}
      <div
        className="absolute top-[70px] left-[70px] space-y-8 transition-opacity transition-duration-[2000ms] z-10"
        style={{ opacity: textOpacity, fontFamily: '"Overpass Mono", monospace' }}
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
          <Card className="w-full max-w-2xl border border-gray-200" style={{ fontFamily: '"Overpass Mono", monospace' }}>
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
          <div
            className="absolute inset-0 flex items-start justify-center z-20 transition-opacity transition-duration-[2000ms] p-4 pt-12 overflow-y-auto"
            style={{ opacity: showOnboarding ? 1 : 0 }}
          >
            <Card className="w-full max-w-2xl">
              <CardHeader>
                <CardTitle className="text-2xl">Welcome! Let&apos;s get you set up</CardTitle>
                <CardDescription>
                  Configure your environment to get ARI running. This step is about preparing your local setup so the application can run smoothly. Nothing here is difficult, but it does require a bit of care and attention to detail. This entire setup process should take around 10 to 20 minutes, depending on your system and familiarity with the tools involved.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
                  <TabsList className="h-auto p-0 bg-transparent border-b border-gray-200 rounded-none w-full justify-start gap-1">
                    <TabsTrigger
                      value="supabase"
                      className="relative rounded-md border border-transparent data-[state=active]:border-gray-300 data-[state=active]:bg-transparent bg-transparent px-4 py-2 font-medium text-sm text-muted-foreground data-[state=active]:text-foreground"
                    >
                      Supabase
                      {isSupabaseComplete && <CheckCircle className="w-3 h-3 ml-1 inline text-green-500" />}
                    </TabsTrigger>
                    <TabsTrigger
                      value="openai"
                      className="relative rounded-md border border-transparent data-[state=active]:border-gray-300 data-[state=active]:bg-transparent bg-transparent px-4 py-2 font-medium text-sm text-muted-foreground data-[state=active]:text-foreground"
                    >
                      OpenAI
                      {formData.openaiApiKey && <CheckCircle className="w-3 h-3 ml-1 inline text-green-500" />}
                    </TabsTrigger>
                    <TabsTrigger
                      value="resend"
                      className="relative rounded-md border border-transparent data-[state=active]:border-gray-300 data-[state=active]:bg-transparent bg-transparent px-4 py-2 font-medium text-sm text-muted-foreground data-[state=active]:text-foreground"
                    >
                      Resend
                      {formData.resendApiKey && <CheckCircle className="w-3 h-3 ml-1 inline text-green-500" />}
                    </TabsTrigger>
                    <TabsTrigger
                      value="vercel"
                      className="relative rounded-md border border-transparent data-[state=active]:border-gray-300 data-[state=active]:bg-transparent bg-transparent px-4 py-2 font-medium text-sm text-muted-foreground data-[state=active]:text-foreground"
                    >
                      Vercel
                      {formData.vercelSetupComplete && <CheckCircle className="w-3 h-3 ml-1 inline text-green-500" />}
                    </TabsTrigger>
                    <TabsTrigger
                      value="personal"
                      className="relative rounded-md border border-transparent data-[state=active]:border-gray-300 data-[state=active]:bg-transparent bg-transparent px-4 py-2 font-medium text-sm text-muted-foreground data-[state=active]:text-foreground"
                    >
                      Personal
                      {(formData.name || formData.email) && <CheckCircle className="w-3 h-3 ml-1 inline text-green-500" />}
                    </TabsTrigger>
                    <TabsTrigger
                      value="download"
                      className="relative rounded-md border border-transparent data-[state=active]:border-gray-300 data-[state=active]:bg-transparent bg-transparent px-4 py-2 font-medium text-sm text-muted-foreground data-[state=active]:text-foreground"
                    >
                      Download
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab 1: Supabase */}
                  <TabsContent value="supabase" className="space-y-4 mt-4">
                    <Alert className="bg-blue-50 border-blue-200">
                      <Database className="w-4 h-4" />
                      <AlertTitle>Supabase Configuration</AlertTitle>
                      <AlertDescription>
                        Supabase provides your database, authentication, and backend services.
                        You&apos;ll need three keys from your Supabase project.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Badge variant="outline">Step 1</Badge>
                        Create a FREE Supabase account
                      </h3>

                      <ol className="text-sm space-y-2 ml-4 list-decimal list-inside text-muted-foreground">
                        <li>
                          Go to{" "}
                          <a
                            href="https://supabase.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            supabase.com
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          {" "}and create a free account
                        </li>
                        <li>Create a new project (free tier)</li>
                        <li>
                          Go to{" "}
                          <a
                            href="https://supabase.com/dashboard/project/_/settings/api"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            Project Settings → API
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </li>
                        <li>Copy each key below</li>
                      </ol>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="supabaseUrl">Project URL</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-4 h-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">
                              Your Supabase project URL (e.g., https://xxxxx.supabase.co)
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="supabaseUrl"
                        value={formData.supabaseUrl}
                        onChange={(e) => setFormData(prev => ({ ...prev, supabaseUrl: e.target.value }))}
                        placeholder="https://xxxxx.supabase.co"
                        className="font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="supabaseAnonKey">Anon/Public Key</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-4 h-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">
                              Also called &quot;anon&quot; or &quot;publishable&quot; key. Safe to use in browser.
                              Starts with &quot;eyJhbGci...&quot;
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Textarea
                        id="supabaseAnonKey"
                        value={formData.supabaseAnonKey}
                        onChange={(e) => setFormData(prev => ({ ...prev, supabaseAnonKey: e.target.value }))}
                        placeholder="eyJhbGci..."
                        className="font-mono text-xs min-h-[80px]"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="supabaseSecretKey">Service Role Secret</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-4 h-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs max-w-xs">
                              Server-side only key that bypasses Row Level Security.
                              Keep this secret! Starts with &quot;eyJhbGci...&quot;
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Textarea
                        id="supabaseSecretKey"
                        value={formData.supabaseSecretKey}
                        onChange={(e) => setFormData(prev => ({ ...prev, supabaseSecretKey: e.target.value }))}
                        placeholder="eyJhbGci..."
                        className="font-mono text-xs min-h-[80px]"
                      />
                    </div>

                    <Alert>
                      <Info className="w-4 h-4" />
                      <AlertDescription>
                        Need help?{" "}
                        <a
                          href="https://supabase.com/docs/guides/api/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          Read the Supabase API Keys documentation
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </AlertDescription>
                    </Alert>

                    <Button
                      onClick={() => setCurrentTab("openai")}
                      className="w-full"
                    >
                      Continue to OpenAI Setup
                    </Button>
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
                        className="font-mono text-xs min-h-[80px]"
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
                  <TabsContent value="resend" className="space-y-4 mt-4">
                    <Alert className="bg-green-50 border-green-200">
                      <Mail className="w-4 h-4" />
                      <AlertTitle>Resend Configuration (Optional)</AlertTitle>
                      <AlertDescription>
                        Enable email sending capabilities (notifications, password resets, etc.).
                        You can skip this step if you don&apos;t need email features.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Badge variant="outline">Step 1</Badge>
                        Create a FREE Resend account
                      </h3>

                      <ol className="text-sm space-y-2 ml-4 list-decimal list-inside text-muted-foreground">
                        <li>
                          Visit{" "}
                          <a
                            href="https://resend.com/api-keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            Resend Dashboard
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          {" "}(3,000 emails/month free)
                        </li>
                        <li>Create a new API key</li>
                        <li>Copy and paste it below</li>
                      </ol>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="resendApiKey">Resend API Key</Label>
                      <Textarea
                        id="resendApiKey"
                        value={formData.resendApiKey}
                        onChange={(e) => setFormData(prev => ({ ...prev, resendApiKey: e.target.value }))}
                        placeholder="re_..."
                        className="font-mono text-xs min-h-[80px]"
                      />
                    </div>

                    <Alert>
                      <Info className="w-4 h-4" />
                      <AlertDescription>
                        Need help?{" "}
                        <a
                          href="https://resend.com/docs/introduction"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          Read the Resend documentation
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </AlertDescription>
                    </Alert>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentTab("openai")}
                        className="flex-1"
                      >
                        Back
                      </Button>
                      <Button
                        onClick={() => setCurrentTab("vercel")}
                        className="flex-1"
                      >
                        {formData.resendApiKey.trim() ? "Continue" : "Skip"} to Vercel
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
                          <code className="bg-gray-100 px-1 rounded text-xs">npm install -g vercel</code>
                        </li>
                        <li>
                          Run{" "}
                          <code className="bg-gray-100 px-1 rounded text-xs">vercel login</code>
                          {" "}in your terminal
                        </li>
                        <li>
                          Run{" "}
                          <code className="bg-gray-100 px-1 rounded text-xs">vercel link</code>
                          {" "}to connect your project
                        </li>
                        <li>Add environment variables in Vercel dashboard</li>
                      </ol>
                    </div>

                    <Alert>
                      <Info className="w-4 h-4" />
                      <AlertDescription>
                        After downloading your .env.local file, you can run{" "}
                        <code className="bg-gray-100 px-1 rounded text-xs">vercel env pull</code>
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
                        Tell us about yourself. This information is optional and stored locally.
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

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentTab("vercel")}
                        className="flex-1"
                      >
                        Back
                      </Button>
                      <Button
                        onClick={() => setCurrentTab("download")}
                        className="flex-1"
                      >
                        Continue to Download
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
                        <pre className="text-xs font-mono whitespace-pre-wrap">
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
