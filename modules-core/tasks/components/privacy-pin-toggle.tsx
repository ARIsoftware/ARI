'use client'

import { Pin, Eye, EyeOff } from 'lucide-react'

/**
 * The pin + privacy-eye toggle pair shown in the top-right of the Task
 * Details card on the add and edit pages. One component so the two forms
 * can't drift. The privacy eye renders only when `showPrivacy` is true
 * (multi-user install, and on the edit page only for the task's owner).
 *
 * Enabled colour reads --task-toggle-accent when the theme defines it
 * (Sovereign Day's blue), falling back to --primary.
 */
interface PrivacyPinToggleProps {
  pinned: boolean
  isPrivate: boolean
  showPrivacy: boolean
  onTogglePin: () => void
  onTogglePrivacy: () => void
}

const ACCENT = 'text-[hsl(var(--task-toggle-accent,var(--primary)))]'

export function PrivacyPinToggle({
  pinned,
  isPrivate,
  showPrivacy,
  onTogglePin,
  onTogglePrivacy,
}: PrivacyPinToggleProps) {
  return (
    <div className="flex items-center gap-2">
      {showPrivacy && (
        <button
          type="button"
          aria-label={isPrivate ? 'Make task shared' : 'Make task private'}
          title={
            isPrivate ? 'Private: only you can see this task' : 'Make private (only you can see it)'
          }
          onClick={onTogglePrivacy}
          className="transition-colors"
        >
          {isPrivate ? (
            <EyeOff className={`w-5 h-5 ${ACCENT}`} />
          ) : (
            <Eye className="w-5 h-5 text-gray-300 hover:text-[hsl(var(--primary))]" />
          )}
        </button>
      )}
      <button
        type="button"
        aria-label={pinned ? 'Unpin this task' : 'Pin this task'}
        title={pinned ? 'Pinned' : 'Pin this task'}
        onClick={onTogglePin}
        className="transition-colors"
      >
        <Pin
          className={`w-5 h-5 ${pinned ? ACCENT : 'text-gray-300 hover:text-[hsl(var(--primary))]'}`}
          fill={pinned ? 'currentColor' : 'none'}
        />
      </button>
    </div>
  )
}
