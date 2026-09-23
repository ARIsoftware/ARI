'use client'

import { useCallback, useMemo, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useModules } from '@/lib/modules/module-hooks'
import {
  MODULE_DASHBOARD_STAT_CARDS,
  MODULE_DASHBOARD_WIDGETS,
} from '@/lib/generated/module-dashboard-registry'
import { useUnsavedChangesGuard } from '@/modules/tasks/hooks/use-unsaved-changes-guard'
import { UnsavedChangesDialog } from '@/modules/tasks/components/unsaved-changes-dialog'
import {
  useDashboardLayout,
  useDashboardSettings,
  useHiddenDashboardCards,
  useUpdateDashboardSettings,
} from '@/modules/dashboard/hooks/use-dashboard-settings'
import {
  DEFAULT_HIDDEN_CARDS,
  layoutSketchCounts,
  listDashboardCards,
  sameHiddenCards,
} from '@/modules/dashboard/lib/cards'
import type { DashboardLayout } from '@/modules/dashboard/lib/validation'
import type { DashboardSettings } from '@/modules/dashboard/types'
import { DashboardSettingsPanel } from '../../components/settings-panel'
import { DashboardCardsPanel } from '../../components/cards-panel'

/**
 * Owns both panels' unsaved drafts so one unsaved-changes guard (the same
 * hook + dialog the Tasks editor uses) covers the whole page: each panel's
 * Save writes its own slice, while the guard's Save writes everything dirty.
 * Drafts survive a failed save and clear on success or Discard.
 */
export default function DashboardSettingsPage() {
  const { modules } = useModules()
  const { isPending } = useDashboardSettings()
  const savedLayout = useDashboardLayout()
  const savedHidden = useHiddenDashboardCards()
  const updateSettings = useUpdateDashboardSettings()
  const { toast } = useToast()

  const [layoutDraft, setLayoutDraft] = useState<DashboardLayout | null>(null)
  const [cardsDraft, setCardsDraft] = useState<Set<string> | null>(null)

  const layout = layoutDraft ?? savedLayout
  const hidden = cardsDraft ?? savedHidden
  const layoutDirty = layoutDraft !== null && layoutDraft !== savedLayout
  const cardsDirty = cardsDraft !== null && !sameHiddenCards(cardsDraft, savedHidden)

  const cards = useMemo(
    () =>
      listDashboardCards(modules, {
        statCards: MODULE_DASHBOARD_STAT_CARDS,
        widgets: MODULE_DASHBOARD_WIDGETS,
      }),
    [modules],
  )
  const counts = useMemo(() => layoutSketchCounts(cards, hidden), [cards, hidden])

  /** PUT a patch; true on success, false (after a toast) on failure. */
  const persist = useCallback(
    async (patch: Partial<DashboardSettings>, what: string): Promise<boolean> => {
      try {
        await updateSettings.mutateAsync(patch)
        toast({ title: `Dashboard ${what} saved` })
        return true
      } catch (err) {
        toast({
          variant: 'destructive',
          title: `Could not save ${what}`,
          description: err instanceof Error ? err.message : 'Please try again.',
        })
        return false
      }
    },
    [updateSettings, toast],
  )

  const saveLayout = async () => {
    if (!layoutDirty) return
    if (await persist({ layout: layoutDraft! }, 'layout')) setLayoutDraft(null)
  }

  const saveCards = async () => {
    if (!cardsDirty) return
    if (await persist({ hiddenCards: [...cardsDraft!] }, 'cards')) setCardsDraft(null)
  }

  /** Guard's Save: everything dirty in one request. */
  const saveAll = useCallback(async (): Promise<boolean> => {
    const patch: Partial<DashboardSettings> = {}
    if (layoutDirty) patch.layout = layoutDraft!
    if (cardsDirty) patch.hiddenCards = [...cardsDraft!]
    const ok = await persist(patch, 'settings')
    if (ok) {
      setLayoutDraft(null)
      setCardsDraft(null)
    }
    return ok
  }, [layoutDirty, layoutDraft, cardsDirty, cardsDraft, persist])

  const { pendingHref, isSaving, closeDialog, discardAndLeave, saveAndLeave } =
    useUnsavedChangesGuard({ hasUnsavedChanges: layoutDirty || cardsDirty, onSave: saveAll })

  const setVisible = (key: string, visible: boolean) => {
    setCardsDraft((prev) => {
      const next = new Set(prev ?? savedHidden)
      if (visible) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-4xl font-medium">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Choose your dashboard layout and the cards it shows.
        </p>
      </div>

      <DashboardSettingsPanel
        value={layout}
        dirty={layoutDirty}
        saving={updateSettings.isPending}
        counts={counts}
        onChange={setLayoutDraft}
        onSave={saveLayout}
        onDiscard={() => setLayoutDraft(null)}
      />

      <DashboardCardsPanel
        cards={cards}
        hidden={hidden}
        dirty={cardsDirty}
        loading={isPending}
        saving={updateSettings.isPending}
        defaults={DEFAULT_HIDDEN_CARDS}
        onChange={setVisible}
        onReplace={(keys) => setCardsDraft(new Set(keys))}
        onSave={saveCards}
        onDiscard={() => setCardsDraft(null)}
      />

      <UnsavedChangesDialog
        open={pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
        isSaving={isSaving}
        onDiscard={discardAndLeave}
        onSave={saveAndLeave}
        description="You have unsaved dashboard settings. Save before leaving?"
      />
    </div>
  )
}
