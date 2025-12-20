"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
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
  LayoutDashboard,
  CheckSquare,
  Settings,
  Package,
  LogOut,
  Radar,
  Plus,
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
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
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

  const handleSignOut = async () => {
    await authClient.signOut()
    router.push("/sign-in")
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push("/dashboard"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/tasks"))}>
            <CheckSquare className="mr-2 h-4 w-4" />
            <span>Tasks</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/radar"))}>
            <Radar className="mr-2 h-4 w-4" />
            <span>Priority Radar</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/modules"))}>
            <Package className="mr-2 h-4 w-4" />
            <span>Modules</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {modules.length > 0 && (
          <CommandGroup heading="Modules">
            {modules
              .filter(m => m.routes && m.routes.length > 0)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((module) => {
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
            }
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => runCommand(() => router.push("/add-task"))}>
            <Plus className="mr-2 h-4 w-4" />
            <span>New Task</span>
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/add-fitness"))}>
            <Plus className="mr-2 h-4 w-4" />
            <span>New Fitness Task</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Account">
          <CommandItem onSelect={() => runCommand(handleSignOut)}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign Out</span>
          </CommandItem>
        </CommandGroup>
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
