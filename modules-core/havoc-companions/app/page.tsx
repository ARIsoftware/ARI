'use client'

/**
 * Havoc Companions Module — Main Page
 *
 * Settings panel for the global Havoc Companions feature. All edits here
 * are buffered as local drafts and only persisted when the user clicks
 * Save. Click a companion preview to swap its species.
 *
 * Companions are actually rendered globally by HavocCompanionsProvider —
 * this page is just the control panel.
 *
 * Route: /havoc-companions
 */

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Loader2, PawPrint, Save, Undo2, Check } from 'lucide-react'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  useHavocSettings,
  useUpdateHavocSettings,
} from '@/modules/havoc-companions/hooks/use-havoc-companions'
import { HavocCompanionPreview } from '@/modules/havoc-companions/components/havoc-companion-preview'
import { ALL_SPECIES, SPECIES_LABEL } from '@/modules/havoc-companions/lib/animals'
import { intensityLabel, speedLabel } from '@/modules/havoc-companions/lib/mischief'
import type { HavocCompanion, CompanionSpecies } from '@/modules/havoc-companions/types'

const DEFAULT_INTENSITY = 3
const DEFAULT_SPEED = 5

interface DraftState {
  names: Record<string, string>
  species: Record<string, CompanionSpecies>
  intensity: number
  speed: number
}

function buildDraftFromSettings(
  animals: HavocCompanion[],
  intensity: number,
  speed: number,
): DraftState {
  const names: Record<string, string> = {}
  const species: Record<string, CompanionSpecies> = {}
  for (const a of animals) {
    names[a.id] = a.name
    species[a.id] = a.species
  }
  return { names, species, intensity, speed }
}

export default function HavocCompanionsPage() {
  const { toast } = useToast()
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')

  const { data: settings, isLoading } = useHavocSettings()
  const updateSettings = useUpdateHavocSettings()

  const [randomQuote, setRandomQuote] = useState<{ quote: string; author?: string } | null>(null)
  const [draft, setDraft] = useState<DraftState | null>(null)

  const animals = settings?.animals ?? []

  // Initialise the draft once settings arrive, and re-sync after each
  // successful save (when the server value matches the just-submitted draft).
  useEffect(() => {
    if (!settings?.animals || animals.length === 0) return
    const fresh = buildDraftFromSettings(
      animals,
      settings.intensity ?? DEFAULT_INTENSITY,
      settings.speed ?? DEFAULT_SPEED,
    )
    setDraft((prev) => {
      // Don't clobber an in-progress edit when settings refetches happen.
      if (prev) return prev
      return fresh
    })
  }, [settings, animals])

  // Random quote (per Module Template pattern)
  useEffect(() => {
    if (!quotesEnabled || quotesLoading) return
    let cancelled = false
    fetch('/api/modules/quotes/quotes')
      .then((res) => (res.ok ? res.json() : []))
      .then((quotes) => {
        if (!cancelled && Array.isArray(quotes) && quotes.length > 0) {
          setRandomQuote(quotes[Math.floor(Math.random() * quotes.length)])
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [quotesEnabled, quotesLoading])

  const isDirty = useMemo(() => {
    if (!draft || !settings?.animals) return false
    if (draft.intensity !== (settings.intensity ?? DEFAULT_INTENSITY)) return true
    if (draft.speed !== (settings.speed ?? DEFAULT_SPEED)) return true
    for (const a of settings.animals) {
      if (draft.names[a.id] !== a.name) return true
      if (draft.species[a.id] !== a.species) return true
    }
    return false
  }, [draft, settings])

  const updateDraft = (
    patch: Partial<DraftState> | ((prev: DraftState) => DraftState),
  ) => {
    setDraft((prev) => {
      if (!prev) return prev
      return typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
    })
  }

  const handleSave = () => {
    if (!draft || !settings?.animals) return

    // Validate names client-side so a clear error fires before round-tripping.
    for (const a of settings.animals) {
      const name = (draft.names[a.id] ?? '').trim()
      if (!name) {
        toast({ variant: 'destructive', title: 'Names cannot be empty' })
        return
      }
      if (name.length > 40) {
        toast({ variant: 'destructive', title: 'Names must be 40 characters or fewer' })
        return
      }
    }

    const nextAnimals: HavocCompanion[] = settings.animals.map((a) => ({
      ...a,
      name: draft.names[a.id].trim(),
      species: draft.species[a.id],
    }))

    updateSettings.mutate(
      {
        animals: nextAnimals,
        intensity: draft.intensity,
        speed: draft.speed,
      },
      {
        onSuccess: () => {
          setDraft(
            buildDraftFromSettings(nextAnimals, draft.intensity, draft.speed),
          )
          toast({ title: 'Saved' })
        },
        onError: (err) => {
          toast({
            variant: 'destructive',
            title: 'Failed to save',
            description: err.message,
          })
        },
      },
    )
  }

  const handleDiscard = () => {
    if (!settings?.animals) return
    setDraft(
      buildDraftFromSettings(
        settings.animals,
        settings.intensity ?? DEFAULT_INTENSITY,
        settings.speed ?? DEFAULT_SPEED,
      ),
    )
  }

  if (isLoading || !draft) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <PawPrint className="w-8 h-8 text-muted-foreground" />
            <h1 className="text-4xl font-medium">Havoc Companions</h1>
          </div>
          {quotesEnabled && randomQuote && (
            <p className="text-sm text-[#aa2020] mt-1">{randomQuote.quote}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={handleDiscard}
            disabled={!isDirty || updateSettings.isPending}
          >
            <Undo2 className="w-4 h-4 mr-2" />
            Discard
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty || updateSettings.isPending}
          >
            {updateSettings.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Three little troublemakers</CardTitle>
          <CardDescription>
            Three cute critters live on your screen. They wander around,
            occasionally take a nap, and every now and then they bump into
            something on the page and leave it a little crooked. Reload at
            any time to put everything back in place.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Companions</CardTitle>
          <CardDescription>
            Click a companion to swap its species, or rename them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {animals.map((animal) => (
              <HavocCompanionCard
                key={animal.id}
                animalId={animal.id}
                draftSpecies={draft.species[animal.id]}
                draftName={draft.names[animal.id] ?? ''}
                onSpeciesChange={(species) =>
                  updateDraft((prev) => ({
                    ...prev,
                    species: { ...prev.species, [animal.id]: species },
                  }))
                }
                onNameChange={(name) =>
                  updateDraft((prev) => ({
                    ...prev,
                    names: { ...prev.names, [animal.id]: name },
                  }))
                }
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <SliderControl
        title="Chaos Intensity"
        description="How often do they bump into things? Higher = more frequent and stronger mischief."
        value={draft.intensity}
        formatLabel={intensityLabel}
        onValueChange={(intensity) => updateDraft({ intensity })}
        footer="Tip: Reload the page any time to undo all the chaos."
      />

      <SliderControl
        title="Speed"
        description="How fast they walk around the screen."
        value={draft.speed}
        formatLabel={speedLabel}
        onValueChange={(speed) => updateDraft({ speed })}
      />
    </div>
  )
}

function HavocCompanionCard({
  animalId,
  draftSpecies,
  draftName,
  onSpeciesChange,
  onNameChange,
}: {
  animalId: string
  draftSpecies: CompanionSpecies
  draftName: string
  onSpeciesChange: (species: CompanionSpecies) => void
  onNameChange: (name: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="flex flex-col items-center gap-3 p-4 border rounded-lg">
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Change species"
            className="rounded-md hover:bg-accent transition-colors p-1 cursor-pointer"
          >
            <HavocCompanionPreview species={draftSpecies} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <div className="text-xs text-muted-foreground mb-2">Pick a species</div>
          <div className="grid grid-cols-3 gap-2">
            {ALL_SPECIES.map((species) => {
              const isSelected = species === draftSpecies
              return (
                <button
                  key={species}
                  type="button"
                  onClick={() => {
                    onSpeciesChange(species)
                    setPickerOpen(false)
                  }}
                  className={cn(
                    'relative flex flex-col items-center gap-1 p-2 rounded-md border transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-accent',
                  )}
                >
                  {isSelected && (
                    <Check className="absolute top-1 right-1 w-3 h-3 text-primary" />
                  )}
                  <HavocCompanionPreview species={species} size={56} animated={false} />
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {SPECIES_LABEL[species]}
                  </span>
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {SPECIES_LABEL[draftSpecies]}
      </div>
      <div className="w-full space-y-1">
        <Label htmlFor={`name-${animalId}`} className="text-xs text-muted-foreground">
          Name
        </Label>
        <Input
          id={`name-${animalId}`}
          value={draftName}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={40}
        />
      </div>
    </div>
  )
}

function SliderControl({
  title,
  description,
  value,
  formatLabel,
  onValueChange,
  footer,
}: {
  title: string
  description: string
  value: number
  formatLabel: (value: number) => string
  onValueChange: (value: number) => void
  footer?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{formatLabel(value)}</span>
          <span className="text-sm font-medium tabular-nums">{value} / 10</span>
        </div>
        <Slider
          min={1}
          max={10}
          step={1}
          value={[value]}
          onValueChange={(v) => {
            if (typeof v[0] === 'number') onValueChange(v[0])
          }}
        />
        {footer && <p className="text-xs text-muted-foreground">{footer}</p>}
      </CardContent>
    </Card>
  )
}
