import moduleManifest from '@/lib/generated/module-manifest.json'

/**
 * Whether this ARI build is a multi-user install.
 *
 * Multi-user is unlocked by the Users module (`ari-users`) being INSTALLED —
 * its code present in the build — not by the per-user enabled flag. This is
 * the same rule the Better Auth `user.create` hook in lib/auth.ts enforces
 * (single-user cap without the module), so every UI gate and server check
 * that asks "is this a multi-user site?" must go through this one helper.
 * The manifest is generated at build time, so the answer is safe to read in
 * both server and client code.
 */
export function isMultiUserInstall(): boolean {
  return moduleManifest.modules.some((m: { id: string }) => m.id === 'ari-users')
}
