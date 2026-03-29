"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import {
  Settings,
  Package,
  Radar,
  Plus,
  Loader2,
} from "lucide-react"
import { getLucideIcon } from "@/lib/modules/icon-utils"
import { useModules } from "@/lib/modules/module-hooks"

interface CommandPaletteProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CommandPalette({ open: controlledOpen, onOpenChange }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const router = useRouter()
  const { modules, loading: modulesLoading } = useModules()

  // Use controlled state if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "K" && e.ctrlKey && e.shiftKey) {
        e.preventDefault()
        setOpen(!open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [open, setOpen])

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [setOpen])

  // Sort modules by menuPriority (lower = higher in list), then alphabetically
  const sortedModules = React.useMemo(() => {
    return modules
      .filter(m => m.routes && m.routes.length > 0)
      .sort((a, b) => {
        const priorityA = a.menuPriority ?? 50
        const priorityB = b.menuPriority ?? 50
        if (priorityA !== priorityB) return priorityA - priorityB
        return a.name.localeCompare(b.name)
      })
  }, [modules])

  // Check if Tasks module is enabled for Quick Actions
  const tasksEnabled = modules.some(m => m.id === 'tasks')

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Dynamic modules - sorted by priority */}
        <CommandGroup heading="Go to">
          {modulesLoading ? (
            <CommandItem disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-muted-foreground">Loading modules...</span>
            </CommandItem>
          ) : sortedModules.length > 0 ? (
            sortedModules.map((module) => {
              const Icon = getLucideIcon(module.icon)
              const route = module.routes![0]
              return (
                <CommandItem
                  key={module.id}
                  onSelect={() => runCommand(() => router.push(route.path))}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <span>{module.name}</span>
                </CommandItem>
              )
            })
          ) : null}
          {/* Static core pages (not modules) */}
          <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/modules"))}>
            <Package className="mr-2 h-4 w-4" />
            <span>Modules</span>
          </CommandItem>
        </CommandGroup>

        {tasksEnabled && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Quick Actions">
              <CommandItem onSelect={() => runCommand(() => router.push("/tasks/add"))}>
                <Plus className="mr-2 h-4 w-4" />
                <span>New Task</span>
                <CommandShortcut>N</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push("/tasks/radar"))}>
                <Radar className="mr-2 h-4 w-4" />
                <span>Priority Radar</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}

// Context for controlling the command palette from anywhere
const CommandPaletteContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
} | null>(null)

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  // Only render the portal after mounting to avoid hydration errors
  React.useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
      {mounted && <CommandPalette open={open} onOpenChange={setOpen} />}
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette() {
  const context = React.useContext(CommandPaletteContext)
  if (!context) {
    throw new Error("useCommandPalette must be used within a CommandPaletteProvider")
  }
  return context
}
