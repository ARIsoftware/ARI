"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { defaultFilter } from "cmdk"
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
  Activity,
  FileCode,
} from "lucide-react"
import { getLucideIcon } from "@/lib/modules/icon-utils"
import { useModules } from "@/lib/modules/module-hooks"
import { useCurrentUser } from "@/hooks/use-users"
import { hasPermission } from "@/lib/permissions"
import { isPublicPathname } from "@/lib/route-helpers"
import { buildAddTaskHref, sanitizeTaskTitlePrefill } from "@/modules/tasks/lib/title-prefill"

// cmdk item value for the "Add as a task" row.
const ADD_TASK_VALUE = "ari-palette-add-task"

// The "Add as a task" row matches every non-empty search, with the lowest
// possible score so cmdk sorts it below every real match (Enter still picks the
// best module/page match first). Everything else uses cmdk's default scoring.
const paletteFilter: typeof defaultFilter = (value, search, keywords) =>
  value === ADD_TASK_VALUE ? Number.MIN_VALUE : defaultFilter(value, search, keywords)

interface CommandPaletteProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CommandPalette({ open: controlledOpen, onOpenChange }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const router = useRouter()
  const pathname = usePathname()
  const { modules, loading: modulesLoading } = useModules()

  // Use controlled state if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpenState = onOpenChange || setInternalOpen
  // Closing also clears the search, so each opening starts empty.
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!next) setSearch("")
      setOpenState(next)
    },
    [setOpenState],
  )

  const isPublicPage = isPublicPathname(pathname)

  React.useEffect(() => {
    if (isPublicPage) return

    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && e.metaKey && !e.shiftKey) {
        e.preventDefault()
        setOpen(!open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [open, setOpen, isPublicPage])

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

  // Settings is only offered to accounts with the permission (the server
  // enforces this independently — hiding the entry is cosmetic). The Users
  // entry comes from the Users module's manifest routes when installed.
  const { data: currentUser } = useCurrentUser({ enabled: !isPublicPage })
  const canAccessSettings = hasPermission(currentUser, 'access_settings')

  // The title the "Add as a task" row would pre-fill (sanitized, so the label
  // shows exactly what the add-task page will receive).
  const addTaskTitle = tasksEnabled ? sanitizeTaskTitlePrefill(search) : ""

  if (isPublicPage) return null

  return (
    <CommandDialog open={open} onOpenChange={setOpen} commandProps={{ filter: paletteFilter }}>
      <CommandInput
        placeholder="Type a command, search, or add a task..."
        value={search}
        onValueChange={setSearch}
      />
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
          {canAccessSettings && (
            <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </CommandItem>
          )}
          <CommandItem onSelect={() => runCommand(() => router.push("/modules"))}>
            <Package className="mr-2 h-4 w-4" />
            <span>Modules Library</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/health"))}>
            <Activity className="mr-2 h-4 w-4" />
            <span>Health Check</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/api-docs"))}>
            <FileCode className="mr-2 h-4 w-4" />
            <span>API Docs</span>
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

        {addTaskTitle && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Add">
              <CommandItem
                value={ADD_TASK_VALUE}
                onSelect={() => runCommand(() => router.push(buildAddTaskHref(addTaskTitle)))}
              >
                <Plus className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">Add &ldquo;{addTaskTitle}&rdquo; as a task</span>
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
