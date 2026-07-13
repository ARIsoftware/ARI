'use client'

import { Activity } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { fmtNumber } from '@/modules/health-data/lib/format'

interface ProcessingScreenProps {
  /** Unified 0–100 percent across upload + parse */
  percent: number
  phase: string
  recordsParsed?: number
}

/**
 * The single progress card shown from the moment a file is picked until
 * parsing completes — upload and processing share one bar.
 */
export function ProcessingScreen({ percent, phase, recordsParsed }: ProcessingScreenProps) {
  return (
    <div className="mx-auto max-w-md">
      <Card className="rounded-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--chart-2)/0.12)]">
            <Activity className="h-8 w-8 animate-pulse text-[hsl(var(--chart-2))]" />
          </div>
          <CardTitle>Processing your health data</CardTitle>
          <CardDescription>
            Large exports contain millions of records — this usually takes under a minute.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={percent} className="[&>div]:bg-[hsl(var(--chart-2))]" />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{phase}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          {recordsParsed !== undefined && recordsParsed > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {fmtNumber(recordsParsed)} records parsed
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
