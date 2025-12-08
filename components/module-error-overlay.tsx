/**
 * Module Error Overlay
 *
 * Full-screen error display for critical module loading errors.
 * Blocks the application until the error is resolved.
 */

import type { DuplicateModuleError } from '@/lib/modules'

interface ModuleErrorOverlayProps {
  errors: DuplicateModuleError[]
}

export function ModuleErrorOverlay({ errors }: ModuleErrorOverlayProps) {
  if (errors.length === 0) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80">
      <div
        className="bg-black border border-black max-w-xl mx-4"
        style={{ padding: '20px' }}
      >
        <h1 className="text-white text-xl font-bold mb-4 uppercase tracking-wide">
          Duplicate Module ID Detected
        </h1>

        {errors.map((error, index) => (
          <div key={index} className="mb-4">
            <p className="text-white mb-2">
              Module ID <code className="bg-white/20 px-1.5 py-0.5 rounded font-mono">&quot;{error.moduleId}&quot;</code> is used by multiple modules:
            </p>
            <ul className="text-white ml-4 mb-3 space-y-1">
              {error.directories.map((dir, i) => (
                <li key={i} className="font-mono text-sm">
                  &bull; {dir}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="border-t border-white/30 pt-4 mt-4">
          <p className="text-white text-sm">
            Each module must have a unique ID. Please update one of the <code className="font-mono">module.json</code> files to use a different ID.
          </p>
        </div>
      </div>
    </div>
  )
}
