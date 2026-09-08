/**
 * Module Template Module - Dashboard Stat Card
 *
 * Stat cards are the small metric tiles in the dashboard's Quick Overview row.
 * They are the lightweight sibling of the full dashboard widget (widget.tsx):
 * one number, one label, one link — no lists or previews.
 *
 * Integration: registered in module.json under
 * "dashboard.statCards": ["./components/stat-card.tsx"]
 * (requires "dashboard.widgets": true — that flag gates both statCards and
 * widgetComponents).
 *
 * The dashboard lazy-loads stat cards via the generated
 * MODULE_DASHBOARD_STAT_CARDS registry and only for enabled modules.
 * NOTE: module-template itself is excluded from real dashboards (it's a
 * developer demo) — this file exists as the reference implementation.
 */

'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Package, Eye, Loader2 } from 'lucide-react'
import { useModuleTemplateEntries } from '../hooks/use-module-template'

export default function ModuleTemplateStatCard() {
  // Reuse the module's shared TanStack Query hook — same cache entry as the
  // main page and widget, so no duplicate network request.
  const { data: entries = [], isLoading } = useModuleTemplateEntries()

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Template Entries</CardTitle>
        <Package className="h-4 w-4 text-blue-600" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="text-2xl font-medium">{entries.length}</div>
            <p className="text-xs text-muted-foreground">entries in your system</p>
          </>
        )}
        {/* Link (soft nav), not window.location — keeps the query cache warm */}
        <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" asChild>
          <Link href="/module-template">
            <Eye className="w-3 h-3 mr-1" />
            View All
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
