/**
 * The module_settings.settings JSONB key that records the SHA-256 of the
 * module schema.sql last installed for a user.
 *
 * Shared single source: the module registry's self-healing gate compares it
 * (lib/modules/module-registry.ts) and backup restore invalidates it
 * (lib/backup/healing.ts) so module schemas reinstall after a restore. A
 * matching literal also lives in lib/db/setup.sql — renaming this key means
 * updating that file too (a unit test on healing enforces the pairing).
 */
export const SCHEMA_INSTALLED_HASH_KEY = '__schema_installed_hash'
