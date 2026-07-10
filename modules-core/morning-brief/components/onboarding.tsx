'use client'

import Link from 'next/link'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Sunrise,
  CalendarCheck,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'

interface RequirementRowProps {
  done: boolean
  icon: LucideIcon
  title: string
  desc: string
}

// Passive status line (NOT interactive). No card border / radio affordance —
// the only control on this screen is the Setup button below.
function RequirementRow({ done, icon: Icon, title, desc }: RequirementRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
          done ? 'bg-green-600/10 text-green-600' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {done ? (
        <span className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          Connected
        </span>
      ) : (
        <span className="flex-shrink-0 text-xs font-medium text-muted-foreground/70">
          Needs setup
        </span>
      )}
    </div>
  )
}

interface OnboardingProps {
  googleConnected: boolean
  aiReady: boolean
}

export function MorningBriefOnboarding({ googleConnected, aiReady }: OnboardingProps) {
  return (
    <div className="p-6 max-w-lg mx-auto">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Sunrise className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome to Morning Brief</CardTitle>
          <CardDescription>
            Each morning, Morning Brief writes you a one-page, printable rundown of your day —
            a personal greeting, a motivational note, your top 5 priority tasks, and today&apos;s meetings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm font-medium text-muted-foreground">
            Before your first brief, two quick connections are needed:
          </p>
          <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
            <RequirementRow
              done={googleConnected}
              icon={CalendarCheck}
              title="Google Calendar"
              desc="So the brief can list today's meetings."
            />
            <RequirementRow
              done={aiReady}
              icon={Sparkles}
              title="AI integration"
              desc="So the brief can be written for you."
            />
          </div>
          <Button asChild className="w-full">
            <Link href="/morning-brief/settings">
              Setup
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
