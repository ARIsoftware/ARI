'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  ExternalLink,
  FileText,
  Loader2,
  Settings as SettingsIcon,
  Sparkles,
  Zap,
} from 'lucide-react'

interface OnboardingProps {
  onComplete: () => void
  isPending: boolean
}

const FEATURES = [
  { icon: Zap, title: 'Streams in real time', desc: 'Replies appear token-by-token, just like ChatGPT.' },
  { icon: FileText, title: 'Reads your files', desc: 'Attach images or text and the model reads them.' },
  { icon: Sparkles, title: 'Any provider', desc: 'OpenAI, Anthropic, Gemini, or OpenRouter — your key, your model.' },
]

export function ChatOnboarding({ onComplete, isPending }: OnboardingProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="relative overflow-hidden rounded-3xl border bg-card shadow-sm">
        {/* Gradient hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-accent/15 via-accent/5 to-transparent px-8 pb-8 pt-10 text-center">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-accent/30 blur-xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent/60 shadow-lg shadow-accent/30">
              <Sparkles className="h-8 w-8 text-accent-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome to Chat</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            A conversational AI workspace that lives inside ARI — every chat private and scoped only to you.
          </p>
        </div>

        <div className="space-y-6 px-8 pb-8">
          {/* Feature grid */}
          <div className="grid gap-3 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border bg-muted/30 p-4">
                <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          {/* Setup steps */}
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
            <p className="mb-2.5 text-sm font-medium">Two steps to your first chat</p>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">1</span>
                <span>
                  Add an API key in{' '}
                  <span className="font-mono text-foreground">Settings → Integrations</span> for any supported provider.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">2</span>
                <span>
                  Come back and hit <span className="font-medium text-foreground">New chat</span>. Switch providers any time in{' '}
                  <span className="font-mono text-foreground">Chat → Settings</span>.
                </span>
              </li>
            </ol>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/settings?tab=integrations">
                <SettingsIcon className="mr-2 h-4 w-4" />
                Open Integrations
                <ExternalLink className="ml-2 h-3 w-3 opacity-60" />
              </Link>
            </Button>
            <Button
              className="flex-1 bg-gradient-to-br from-accent to-accent/80 text-accent-foreground hover:opacity-90"
              onClick={onComplete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  I&apos;ve added a key — let&apos;s chat
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
