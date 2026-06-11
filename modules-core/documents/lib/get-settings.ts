// Shared helper used by every route that needs the per-user documents settings.
// Filtering by both userId and moduleId is defense-in-depth on top of the
// module_settings RLS policies in lib/db/setup.sql.

import { moduleSettings } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import type { DrizzleDb } from '@/lib/db'
import { DEFAULT_DOCUMENTS_SETTINGS, MODULE_ID } from '../types'
import type { DocumentsSettings } from '../types'

type WithRLS = <T>(op: (db: DrizzleDb) => Promise<T>) => Promise<T>

export async function getDocumentsSettings(
  withRLS: WithRLS,
  userId: string
): Promise<DocumentsSettings> {
  const rows = await withRLS((db) =>
    db.select({ settings: moduleSettings.settings })
      .from(moduleSettings)
      .where(and(eq(moduleSettings.userId, userId), eq(moduleSettings.moduleId, MODULE_ID)))
      .limit(1)
  )

  if (rows.length === 0) {
    return DEFAULT_DOCUMENTS_SETTINGS
  }

  return {
    ...DEFAULT_DOCUMENTS_SETTINGS,
    ...(rows[0]?.settings as object || {}),
  } as DocumentsSettings
}
