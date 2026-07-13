'use client'

import { memo, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmtDateTime, fmtNumber } from '@/modules/health-data/lib/format'
import { strideSample } from '@/modules/health-data/lib/stats'
import { useHealthEcgDetail } from '@/modules/health-data/hooks/use-health-data'
import type { HealthEcg } from '@/modules/health-data/types'

/** Cap points drawn in the enlarged strip so the SVG stays responsive */
const FULL_STRIP_MAX_POINTS = 6000

/**
 * One ECG recording: metadata header + lightweight SVG waveform preview.
 * Click to open the full-resolution strip (fetched lazily). A plain SVG
 * polyline (not recharts) keeps 40+ waveform cards cheap, and memo()
 * keeps unrelated page state changes from re-rendering them all.
 */
export const EcgCard = memo(function EcgCard({ ecg }: { ecg: HealthEcg }) {
  const [open, setOpen] = useState(false)
  const points = useMemo(() => buildPolylinePoints(ecg.waveform, 1000, 160), [ecg.waveform])

  return (
    <>
      <Card
        className="cursor-pointer rounded-sm transition-colors hover:border-[hsl(var(--chart-2)/0.5)]"
        role="button"
        tabIndex={0}
        aria-label={`View full ECG strip from ${fmtDateTime(ecg.recorded_at)}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">{fmtDateTime(ecg.recorded_at)}</CardTitle>
            <div className="flex items-center gap-2">
              {ecg.average_heart_rate !== null && (
                <span className="text-xs text-muted-foreground">
                  {fmtNumber(ecg.average_heart_rate)} BPM avg
                </span>
              )}
              <ClassificationBadge classification={ecg.classification} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {points ? (
            <svg
              viewBox="0 0 1000 160"
              preserveAspectRatio="none"
              className="h-20 w-full"
              role="img"
              aria-label={`ECG waveform recorded ${fmtDateTime(ecg.recorded_at)}`}
            >
              <polyline
                points={points}
                fill="none"
                stroke="hsl(var(--chart-2))"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No waveform data</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {ecg.symptoms ? `Symptoms: ${ecg.symptoms}` : 'No symptoms reported'}
            {ecg.duration_sec ? ` · ${Math.round(ecg.duration_sec)}s` : ''}
            {ecg.sampling_frequency_hz ? ` · ${fmtNumber(ecg.sampling_frequency_hz)} Hz` : ''}
            {ecg.device ? ` · ${ecg.device}` : ''}
          </p>
        </CardContent>
      </Card>

      {open && <EcgStripDialog ecg={ecg} onClose={() => setOpen(false)} />}
    </>
  )
})

function EcgStripDialog({ ecg, onClose }: { ecg: HealthEcg; onClose: () => void }) {
  const { data: detail, isLoading } = useHealthEcgDetail(ecg.id)

  const fullPoints = useMemo(() => {
    const waveform = detail?.waveform_full
    if (!waveform || waveform.length < 2) return null
    return buildPolylinePoints(strideSample(waveform, FULL_STRIP_MAX_POINTS), 2400, 200)
  }, [detail])

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl rounded-sm">
        <DialogHeader>
          <DialogTitle>ECG · {fmtDateTime(ecg.recorded_at)}</DialogTitle>
          <DialogDescription>
            {ecg.classification ?? 'Unclassified'}
            {ecg.average_heart_rate !== null ? ` · ${fmtNumber(ecg.average_heart_rate)} BPM avg` : ''}
            {ecg.symptoms ? ` · Symptoms: ${ecg.symptoms}` : ' · No symptoms reported'}
            {ecg.sample_count ? ` · ${fmtNumber(ecg.sample_count)} samples` : ''}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : fullPoints ? (
          <div className="overflow-x-auto rounded-sm border border-border bg-muted/20 p-2">
            <svg
              viewBox="0 0 2400 200"
              width={2400}
              height={200}
              className="block"
              role="img"
              aria-label="Full ECG strip"
            >
              <polyline
                points={fullPoints}
                fill="none"
                stroke="hsl(var(--chart-2))"
                strokeWidth="1"
              />
            </svg>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Full strip not available for this import — re-upload your export to store full-resolution ECGs.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Scroll horizontally to read the full 30-second strip.</p>
      </DialogContent>
    </Dialog>
  )
}

function ClassificationBadge({ classification }: { classification: string | null }) {
  if (!classification) return null
  const lower = classification.toLowerCase()
  if (lower.includes('sinus')) {
    return <Badge variant="outline" className="rounded-sm border-emerald-500/50 text-emerald-600 dark:text-emerald-400">{classification}</Badge>
  }
  if (lower.includes('fibrillation') || lower.includes('high') || lower.includes('low')) {
    return <Badge variant="destructive" className="rounded-sm">{classification}</Badge>
  }
  return <Badge variant="secondary" className="rounded-sm">{classification}</Badge>
}

function buildPolylinePoints(waveform: number[], width: number, height: number): string | null {
  if (!Array.isArray(waveform) || waveform.length < 2) return null
  let min = Infinity
  let max = -Infinity
  for (const v of waveform) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const spread = max - min || 1
  const pad = height * 0.05
  const usable = height - pad * 2
  const stepX = width / (waveform.length - 1)
  const parts: string[] = new Array(waveform.length)
  for (let i = 0; i < waveform.length; i++) {
    const x = i * stepX
    const y = height - pad - ((waveform[i] - min) / spread) * usable
    parts[i] = `${x.toFixed(1)},${y.toFixed(1)}`
  }
  return parts.join(' ')
}
