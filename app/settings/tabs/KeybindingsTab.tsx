"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Keyboard, RotateCcw } from "lucide-react"

interface KeyBinding {
  id: string
  defaultKeys: string[]
  description: string
  category: "navigation" | "editing" | "general"
}

const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  {
    id: "command-palette",
    defaultKeys: ["⌘", "K"],
    description: "Open command palette",
    category: "navigation",
  },
  {
    id: "toggle-sidebar",
    defaultKeys: ["⌘", "B"],
    description: "Toggle sidebar visibility",
    category: "navigation",
  },
  {
    id: "drag-drop-mode",
    defaultKeys: ["⌘", "D"],
    description: "Enter drag-and-drop mode to reorder sidebar modules",
    category: "editing",
  },
]

const STORAGE_KEY = "ari-keybindings"

// Convert KeyboardEvent to display keys
function eventToKeys(e: KeyboardEvent): string[] {
  const keys: string[] = []

  if (e.metaKey || e.ctrlKey) {
    keys.push("⌘")
  }
  if (e.altKey) {
    keys.push("⌥")
  }
  if (e.shiftKey) {
    keys.push("⇧")
  }

  // Get the actual key (uppercase for letters)
  const key = e.key.toUpperCase()
  if (!["META", "CONTROL", "ALT", "SHIFT"].includes(key)) {
    keys.push(key)
  }

  return keys
}

function KeyCombo({
  keys,
  isEditing,
  onClick
}: {
  keys: string[]
  isEditing?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
        isEditing
          ? "bg-indigo-100 ring-2 ring-indigo-500"
          : "hover:bg-slate-100"
      }`}
    >
      {isEditing ? (
        <span className="text-xs text-indigo-600 font-medium">Press keys...</span>
      ) : (
        keys.map((key, index) => (
          <span key={index}>
            <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-slate-200 bg-slate-100 px-1.5 text-xs font-medium text-slate-700">
              {key}
            </kbd>
            {index < keys.length - 1 && (
              <span className="mx-0.5 text-slate-400">+</span>
            )}
          </span>
        ))
      )}
    </button>
  )
}

export function KeybindingsTab(): React.ReactElement {
  const [customBindings, setCustomBindings] = useState<Record<string, string[]>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // Load saved keybindings from localStorage
  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setCustomBindings(JSON.parse(saved))
      } catch {
        console.error("Failed to parse saved keybindings")
      }
    }
  }, [])

  // Save keybindings to localStorage
  const saveBindings = useCallback((bindings: Record<string, string[]>) => {
    setCustomBindings(bindings)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
  }, [])

  // Handle key press when editing
  useEffect(() => {
    if (!editingId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const keys = eventToKeys(e)

      // Only accept if there's a modifier + another key
      if (keys.length >= 2 && keys.some(k => ["⌘", "⌥", "⇧"].includes(k))) {
        const newBindings = { ...customBindings, [editingId]: keys }
        saveBindings(newBindings)
        setEditingId(null)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditingId(null)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleEscape)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleEscape)
    }
  }, [editingId, customBindings, saveBindings])

  // Get current keys for a binding (custom or default)
  const getKeys = (binding: KeyBinding): string[] => {
    return customBindings[binding.id] || binding.defaultKeys
  }

  // Check if a binding has been customized
  const isCustomized = (binding: KeyBinding): boolean => {
    return binding.id in customBindings
  }

  // Reset a single binding to default
  const resetBinding = (bindingId: string) => {
    const newBindings = { ...customBindings }
    delete newBindings[bindingId]
    saveBindings(newBindings)
  }

  // Reset all bindings to defaults
  const resetAllBindings = () => {
    saveBindings({})
  }

  const navigationBindings = DEFAULT_KEYBINDINGS.filter(kb => kb.category === "navigation")
  const editingBindings = DEFAULT_KEYBINDINGS.filter(kb => kb.category === "editing")

  const hasAnyCustomBindings = Object.keys(customBindings).length > 0

  // Don't render interactive elements until mounted to avoid hydration issues
  if (!mounted) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Keyboard className="h-5 w-5 text-indigo-500" />
              Keyboard Shortcuts
            </CardTitle>
            <CardDescription>
              Loading keybindings...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Keyboard className="h-5 w-5 text-indigo-500" />
                Keyboard Shortcuts
              </CardTitle>
              <CardDescription className="mt-1.5">
                Click on any shortcut to change it. Press Escape to cancel.
              </CardDescription>
            </div>
            {hasAnyCustomBindings && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetAllBindings}
                className="flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Navigation shortcuts */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-slate-700 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Navigation</Badge>
            </h3>
            <div className="space-y-3">
              {navigationBindings.map((binding) => (
                <div
                  key={binding.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3"
                >
                  <span className="text-sm text-slate-700">{binding.description}</span>
                  <div className="flex items-center gap-2">
                    <KeyCombo
                      keys={getKeys(binding)}
                      isEditing={editingId === binding.id}
                      onClick={() => setEditingId(editingId === binding.id ? null : binding.id)}
                    />
                    {isCustomized(binding) && (
                      <button
                        type="button"
                        onClick={() => resetBinding(binding.id)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                        title="Reset to default"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Editing shortcuts */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-slate-700 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Editing</Badge>
            </h3>
            <div className="space-y-3">
              {editingBindings.map((binding) => (
                <div
                  key={binding.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3"
                >
                  <span className="text-sm text-slate-700">{binding.description}</span>
                  <div className="flex items-center gap-2">
                    <KeyCombo
                      keys={getKeys(binding)}
                      isEditing={editingId === binding.id}
                      onClick={() => setEditingId(editingId === binding.id ? null : binding.id)}
                    />
                    {isCustomized(binding) && (
                      <button
                        type="button"
                        onClick={() => resetBinding(binding.id)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                        title="Reset to default"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
