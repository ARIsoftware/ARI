'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAdvisors, useCreateAdvisor } from '@/modules/board-of-advisors/hooks/use-board-of-advisors'
import { destructiveToast } from '@/modules/board-of-advisors/lib/utils'
import { ADVISOR_NAME_MAX, ADVISOR_DESCRIPTION_MAX } from '@/modules/board-of-advisors/lib/limits'
import { AdvisorAvatar } from './advisor-avatar'

interface OnboardingProps {
  onComplete: () => void
  isPending: boolean
}

const FEATURES = [
  { title: 'Your personal board', desc: 'Invent any advisors you like — real legends, mentors, or archetypes.' },
  { title: 'A true roundtable', desc: 'Every advisor answers in turn and reacts to what the others said.' },
  { title: 'Your key, your model', desc: 'Powered by any AI provider you configure in Settings → Integrations.' },
]

const EXAMPLE_ADVISORS = [
  { name: 'Steve Jobs', description: 'A visionary CEO obsessed with detail, simplicity, and taste. Always tells the truth, even when it stings.' },
  { name: 'Warren Buffett', description: 'A patient value investor. Thinks in decades, hates unnecessary risk, and explains things with folksy clarity.' },
  { name: 'Marcus Aurelius', description: 'A stoic philosopher-emperor. Calm under pressure, focused on what is within your control and acting with virtue.' },
]

export function BoardOnboarding({ onComplete, isPending }: OnboardingProps) {
  const { toast } = useToast()
  const { data: advisors = [] } = useAdvisors()
  const createAdvisor = useCreateAdvisor()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({})

  const addAdvisor = (advisorName: string, advisorDescription: string) => {
    createAdvisor.mutate(
      { name: advisorName, description: advisorDescription },
      {
        onSuccess: () => {
          setName('')
          setDescription('')
          setErrors({})
        },
        onError: (err) => toast(destructiveToast('Failed to add advisor', err)),
      },
    )
  }

  const handleAdd = () => {
    const fieldErrors: { name?: string; description?: string } = {}
    if (!name.trim()) fieldErrors.name = 'Name is required'
    if (!description.trim()) fieldErrors.description = 'Personality description is required'
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return
    addAdvisor(name.trim(), description.trim())
  }

  const existingNames = new Set(advisors.map((a) => a.name.toLowerCase()))
  const remainingExamples = EXAMPLE_ADVISORS.filter((e) => !existingNames.has(e.name.toLowerCase()))

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-8 pb-7 pt-9 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome to your Board of Advisors</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Assemble a roundtable of personas and put your biggest questions to them — every
            advisor speaks, in turn, in character.
          </p>
        </div>

        <div className="space-y-6 px-8 py-7">
          {/* Feature grid */}
          <div className="grid gap-3 sm:grid-cols-3">
            {FEATURES.map(({ title, desc }) => (
              <div key={title} className="rounded-xl border bg-muted/30 p-4">
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          {/* Seat your first advisors */}
          <div className="rounded-xl border p-4">
            <p className="text-sm font-medium">Seat your first advisors</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A name and a personality is all it takes. Add a few — the conversation gets
              interesting when they disagree.
            </p>

            {advisors.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {advisors.map((a) => (
                  <span key={a.id} className="flex items-center gap-1.5 rounded-full border bg-background py-1 pl-1 pr-3 text-xs font-medium shadow-sm animate-in fade-in zoom-in-95">
                    <AdvisorAvatar name={a.name} color={a.color} size="sm" />
                    {a.name}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="onboarding-name" className="text-xs">Name</Label>
                <Input
                  id="onboarding-name"
                  value={name}
                  maxLength={ADVISOR_NAME_MAX}
                  placeholder="e.g. Steve Jobs"
                  className={cn('bg-background', errors.name && 'border-red-500 focus-visible:ring-red-500')}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }))
                  }}
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="onboarding-description" className="text-xs">Personality</Label>
                <Textarea
                  id="onboarding-description"
                  value={description}
                  maxLength={ADVISOR_DESCRIPTION_MAX}
                  rows={2}
                  placeholder="e.g. A smart CEO who is obsessed over the details and always tells the truth."
                  className={cn('resize-none bg-background', errors.description && 'border-red-500 focus-visible:ring-red-500')}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }))
                  }}
                />
                {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={handleAdd} disabled={createAdvisor.isPending}>
                {createAdvisor.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Add advisor
              </Button>
            </div>

            {remainingExamples.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Or seat a classic
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {remainingExamples.map((example) => (
                    <button
                      key={example.name}
                      type="button"
                      disabled={createAdvisor.isPending}
                      onClick={() => addAdvisor(example.name, example.description)}
                      className="rounded-full border bg-background px-3 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      + {example.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/settings?tab=integrations">Open Integrations</Link>
            </Button>
            <Button
              className="flex-1"
              onClick={onComplete}
              disabled={isPending || advisors.length === 0}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Convene the board'
              )}
            </Button>
          </div>
          {advisors.length === 0 && (
            <p className="-mt-3 text-center text-[11px] text-muted-foreground">
              Add at least one advisor to continue.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
