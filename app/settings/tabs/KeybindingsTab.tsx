"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { Keyboard, Terminal, Server } from "lucide-react"

interface KeyBinding {
  id: string
  keys: string[]
  description: string
}

const KEYBINDINGS: KeyBinding[] = [
  {
    id: "command-palette",
    keys: ["⌘", "K"],
    description: "Open command palette",
  },
  {
    id: "toggle-sidebar",
    keys: ["Ctrl", "⇧", "B"],
    description: "Toggle sidebar visibility",
  },
  {
    id: "drag-drop-mode",
    keys: ["Ctrl", "⇧", "D"],
    description: "Enter drag-and-drop mode to reorder sidebar modules",
  },
  {
    id: "quick-add-task",
    keys: ["Ctrl", "⇧", "L"],
    description: "Open quick add task panel",
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
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Keyboard className="h-5 w-5 text-indigo-500" />
            Keyboard Shortcuts
          </CardTitle>
          <CardDescription>
            Navigate ARI faster with these keyboard shortcuts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {KEYBINDINGS.map((binding) => (
              <div
                key={binding.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3"
              >
                <span className="text-sm text-slate-700">{binding.description}</span>
                <KeyCombo keys={binding.keys} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-5 w-5 text-indigo-500" />
            Server
          </CardTitle>
          <CardDescription>
            Manage your local ARI server from the terminal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <span className="text-sm font-medium text-slate-700">./ari start</span>
              <p className="text-xs text-slate-500 mt-0.5">Start ARI</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <span className="text-sm font-medium text-slate-700">./ari start --verbose</span>
              <p className="text-xs text-slate-500 mt-0.5">Start ARI and display full server logs in terminal</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <span className="text-sm font-medium text-slate-700">./ari status</span>
              <p className="text-xs text-slate-500 mt-0.5">Check the status of ARI and the database</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <span className="text-sm font-medium text-slate-700">./ari update</span>
              <p className="text-xs text-slate-500 mt-0.5">Pull latest ARI updates and install dependencies</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-5 w-5 text-indigo-500" />
            Claude Commands
          </CardTitle>
          <CardDescription>
            Custom slash commands for Claude Code. Run these in the Claude Code CLI to automate common ARI tasks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <span className="text-sm font-medium text-slate-700">/ari-create-module</span>
              <p className="text-xs text-slate-500 mt-0.5">Create a new custom module in the modules-custom directory</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <span className="text-sm font-medium text-slate-700">/ari-audit-module</span>
              <p className="text-xs text-slate-500 mt-0.5">Audit a module for issues, anti-patterns, and ARI conventions</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <span className="text-sm font-medium text-slate-700">/ari-update</span>
              <p className="text-xs text-slate-500 mt-0.5">Pull the latest ARI updates from the official upstream repository</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
