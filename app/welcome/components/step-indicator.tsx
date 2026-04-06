"use client"

import { Database } from "lucide-react"
import { cn } from "@/lib/utils"

interface StepIndicatorProps {
  currentStep: string
  onStepClick: (step: string) => void
}

const STEPS = [
  { id: "personal", label: "Personal" },
  { id: "account", label: "Account" },
  { id: "supabase", label: "Supabase" },
  { id: "resend", label: "Resend" },
  { id: "github", label: "GitHub" },
  { id: "vercel", label: "Vercel" },
  { id: "download", label: "Save" },
  { id: "install", label: "Install" },
]

// Icon components that accept className for dynamic sizing
const GithubIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
)

const SupabaseIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C-.33 13.427.65 15.455 2.409 15.455h9.579l.113 7.51c.014.985 1.259 1.408 1.873.636l9.262-11.653c1.093-1.375.113-3.403-1.645-3.403h-9.642z" />
  </svg>
)

const ResendIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
)

const VercelIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M24 22.525H0l12-21.05 12 21.05z" />
  </svg>
)

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
)

const PersonIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </svg>
)

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "personal": PersonIcon,
  account: ShieldIcon,
  github: GithubIcon,
  supabase: SupabaseIcon,
  resend: ResendIcon,
  vercel: VercelIcon,
  download: DownloadIcon,
  install: Database,
}

export function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <div className="mb-8 flex items-center justify-between">
      {STEPS.map((step, index) => {
        const isActive = step.id === currentStep
        const IconComponent = STEP_ICONS[step.id]

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            {/* Step circle and label */}
            <button
              onClick={() => onStepClick(step.id)}
              className="flex flex-col items-center gap-2"
            >
              <div
                className={cn(
                  "relative flex items-center justify-center rounded-full transition-all",
                  isActive
                    ? "w-16 h-16 bg-zinc-900 text-white ring-4 ring-zinc-200"
                    : "w-14 h-14 bg-zinc-200 text-zinc-500"
                )}
              >
                <IconComponent className={isActive ? "w-7 h-7" : "w-6 h-6"} />
              </div>
              <span
                className={cn(
                  "text-sm font-medium whitespace-nowrap",
                  isActive ? "text-zinc-900" : "text-zinc-500"
                )}
              >
                {step.label}
              </span>
            </button>

            {/* Connector line */}
            {index < STEPS.length - 1 && (
              <div className="h-0.5 flex-1 mx-2 bg-zinc-200" />
            )}
          </div>
        )
      })}
    </div>
  )
}
