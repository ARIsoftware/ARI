"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Keyboard } from "lucide-react"

interface KeyBinding {
  id: string
  keys: string[]
  description: string
  category: "navigation" | "editing"
}

const KEYBINDINGS: KeyBinding[] = [
  {
    id: "command-palette",
    keys: ["⌘", "K"],
    description: "Open command palette",
    category: "navigation",
  },
  {
    id: "toggle-sidebar",
    keys: ["⌘", "B"],
    description: "Toggle sidebar visibility",
    category: "navigation",
  },
  {
    id: "drag-drop-mode",
    keys: ["⌘", "D"],
    description: "Enter drag-and-drop mode to reorder sidebar modules",
    category: "editing",
  },
]

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <span key={index}>
          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-slate-200 bg-slate-100 px-1.5 text-xs font-medium text-slate-700">
            {key}
          </kbd>
          {index < keys.length - 1 && (
            <span className="mx-0.5 text-slate-400">+</span>
          )}
        </span>
      ))}
    </div>
  )
}

export function KeybindingsTab(): React.ReactElement {
  const navigationBindings = KEYBINDINGS.filter(kb => kb.category === "navigation")
  const editingBindings = KEYBINDINGS.filter(kb => kb.category === "editing")

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Keyboard className="h-5 w-5 text-indigo-500" />
            Keyboard Shortcuts
          </CardTitle>
          <CardDescription>
            Navigate ARI faster with these keyboard shortcuts. All shortcuts use the Command key (⌘) on Mac or Control (Ctrl) on Windows.
          </CardDescription>
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
                  <KeyCombo keys={binding.keys} />
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
                  <KeyCombo keys={binding.keys} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
