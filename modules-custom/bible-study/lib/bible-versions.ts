/**
 * Bible Version Registry
 *
 * Architecture notes:
 * - Versions are defined here as the single source of truth for the UI.
 * - `source_type` distinguishes what kind of access is available:
 *     'public_domain' — text may be stored and displayed directly in the app
 *     'licensed'      — text requires a license; display via external API or licensed source
 *     'api_reference' — text retrieved at runtime from a third-party Bible API
 * - To add a new version: append an entry to BIBLE_VERSIONS below.
 *   No DB migration is needed. The version selector reads this array dynamically.
 * - If you later want DB-driven management (e.g., admin UI), create a `bible_versions`
 *   table and seed it from this file. The `id` fields match for easy seeding.
 */

export interface BibleVersion {
  /** Short unique identifier, also used as the stored value in settings */
  id: string
  /** Display code shown in selectors (e.g. "ESV") */
  code: string
  /** Full name (e.g. "English Standard Version") */
  name: string
  /** ISO 639-1 language code */
  language: string
  /** Publisher or rights holder */
  publisher: string | null
  /** Whether to show in the UI */
  is_active: boolean
  /** Determines how text may be used — see notes above */
  source_type: 'public_domain' | 'licensed' | 'api_reference'
  /** URL or API endpoint to retrieve text, if applicable */
  source_reference: string | null
  /** Any additional notes about licensing or usage */
  notes: string | null
}

export const BIBLE_VERSIONS: BibleVersion[] = [
  {
    id: 'ESV',
    code: 'ESV',
    name: 'English Standard Version',
    language: 'en',
    publisher: 'Crossway',
    is_active: true,
    source_type: 'licensed',
    source_reference: null,
    notes: 'Copyright © 2001 by Crossway. Requires ESV API key for full-text access.',
  },
  {
    id: 'NIV',
    code: 'NIV',
    name: 'New International Version',
    language: 'en',
    publisher: 'Zondervan / Biblica',
    is_active: true,
    source_type: 'licensed',
    source_reference: null,
    notes: 'Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™',
  },
  {
    id: 'KJV',
    code: 'KJV',
    name: 'King James Version',
    language: 'en',
    publisher: null,
    is_active: true,
    source_type: 'public_domain',
    source_reference: 'https://www.biblegateway.com/versions/King-James-Version-KJV-Bible/',
    notes: 'Public domain in most countries. Text may be stored and displayed directly.',
  },
  {
    id: 'NKJV',
    code: 'NKJV',
    name: 'New King James Version',
    language: 'en',
    publisher: 'Thomas Nelson',
    is_active: true,
    source_type: 'licensed',
    source_reference: null,
    notes: 'Copyright © 1982 by Thomas Nelson.',
  },
  {
    id: 'TPT',
    code: 'TPT',
    name: 'The Passion Translation',
    language: 'en',
    publisher: 'BroadStreet Publishing',
    is_active: true,
    source_type: 'licensed',
    source_reference: null,
    notes: 'Copyright © 2017, 2018, 2020 by Passion & Fire Ministries, Inc.',
  },
  {
    id: 'AMP',
    code: 'AMP',
    name: 'Amplified Bible',
    language: 'en',
    publisher: 'Zondervan / The Lockman Foundation',
    is_active: true,
    source_type: 'licensed',
    source_reference: null,
    notes: 'Copyright © 2015 by The Lockman Foundation.',
  },
  {
    id: 'CJB',
    code: 'CJB',
    name: 'Complete Jewish Bible',
    language: 'en',
    publisher: 'Jewish New Testament Publications',
    is_active: true,
    source_type: 'licensed',
    source_reference: null,
    notes: 'Copyright © 1998 by David H. Stern.',
  },
  // ── Additional versions — uncomment or add entries here to enable ──
  // {
  //   id: 'NLT',
  //   code: 'NLT',
  //   name: 'New Living Translation',
  //   language: 'en',
  //   publisher: 'Tyndale House Foundation',
  //   is_active: false,
  //   source_type: 'licensed',
  //   source_reference: null,
  //   notes: 'Copyright © 1996, 2004, 2015 by Tyndale House Foundation.',
  // },
  // {
  //   id: 'MSG',
  //   code: 'MSG',
  //   name: 'The Message',
  //   language: 'en',
  //   publisher: 'NavPress',
  //   is_active: false,
  //   source_type: 'licensed',
  //   source_reference: null,
  //   notes: 'Copyright © 1993–2018 by Eugene H. Peterson.',
  // },
  // {
  //   id: 'ASV',
  //   code: 'ASV',
  //   name: 'American Standard Version',
  //   language: 'en',
  //   publisher: null,
  //   is_active: false,
  //   source_type: 'public_domain',
  //   source_reference: null,
  //   notes: 'Public domain (1901).',
  // },
]

/** Returns only active versions. */
export const ACTIVE_VERSIONS = BIBLE_VERSIONS.filter((v) => v.is_active)

/** Look up a version by its id/code. */
export function getVersion(code: string): BibleVersion | undefined {
  return BIBLE_VERSIONS.find((v) => v.id === code)
}

/** The default preferred version used when no preference is set. */
export const DEFAULT_VERSION = 'ESV'
