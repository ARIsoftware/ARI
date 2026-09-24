'use client'

import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import type { DashboardCardInfo } from '@/modules/dashboard/lib/cards'

interface DashboardCardsPanelProps {
  cards: DashboardCardInfo[]
  /** Keys currently switched off — the unsaved draft when there is one, else the saved set. */
  hidden: ReadonlySet<string>
  /** True when `hidden` differs from what is saved. */
  dirty: boolean
  /** Settings still loading — switches are shown but inert. */
  loading: boolean
  saving: boolean
  onChange: (key: string, visible: boolean) => void
  /** Replace the whole draft (Reset to defaults). */
  onReplace: (hidden: Iterable<string>) => void
  defaults: readonly string[]
  onSave: () => void
  onDiscard: () => void
}

/**
 * Show/hide switch for every card the dashboard can display — one row per
 * card, labelled by module ("Tasks", "Tasks 2", ...). One selection covers
 * both layouts. The parent page owns the draft and persists it on Save (or
 * through the unsaved-changes guard).
 */
export function DashboardCardsPanel({
  cards,
  hidden,
  dirty,
  loading,
  saving,
  onChange,
  onReplace,
  defaults,
  onSave,
  onDiscard,
}: DashboardCardsPanelProps) {
  const inert = loading || saving

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle>Cards</CardTitle>
          {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
        </div>
        <CardDescription>
          Choose which cards appear on your dashboard. Applies to both layouts and only to your
          account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="max-w-2xl divide-y">
          {cards.map((card) => {
            const id = `dashboard-card-${card.key}`
            return (
              <li key={card.key} className="flex items-center justify-between gap-4 py-3">
                <label htmlFor={id} className="text-sm font-medium">
                  {card.label}
                </label>
                <Switch
                  id={id}
                  checked={!hidden.has(card.key)}
                  disabled={inert}
                  onCheckedChange={(checked) => onChange(card.key, checked)}
                  aria-label={`Show ${card.label} on the dashboard`}
                />
              </li>
            )
          })}
        </ul>
        <div className="flex max-w-2xl items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onReplace(defaults)} disabled={inert}>
            Reset to defaults
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={onDiscard} disabled={saving}>
              Discard
            </Button>
          )}
          <Button onClick={onSave} disabled={!dirty || inert}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
