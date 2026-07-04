'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Bot, Check, ChevronsUpDown, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { agentStatusDotClass } from '@/modules/tasks/lib/utils'
import { useAuth } from '@/components/providers'
import { useModuleEnabled } from '@/lib/modules/module-hooks'

/** What the picker reads and writes on the task form. */
export interface AssigneeValue {
  /** Empty, or exactly one display name. */
  assignees: string[]
  /** Set when the assignee is an agent from the Agents module. */
  assigned_agent_id: string | null
}

interface AssignableUser {
  id: string
  name: string
}

interface AssignableAgent {
  id: string
  name: string
  role: string
  status: 'idle' | 'working' | 'blocked'
}

function useAssignableUsers() {
  return useQuery({
    queryKey: ['task-assignable-users'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AssignableUser[]> => {
      const res = await fetch('/api/modules/tasks/users')
      if (!res.ok) return []
      const data = await res.json()
      return data.users || []
    },
  })
}

/** Agents are a soft dependency — the query only runs when the Agents module
 *  is enabled (the module router dispatches even for disabled modules, and the
 *  agents GET handler seeds starter agents, so an ungated fetch would create
 *  agent rows for a module the user never turned on). The queryKey is the
 *  agents module's own ['agents'] key so agent CRUD invalidations propagate
 *  here instead of serving a stale list from a private cache. */
function useAssignableAgents() {
  const { enabled: agentsEnabled } = useModuleEnabled('agents')
  return useQuery({
    queryKey: ['agents'],
    enabled: agentsEnabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch('/api/modules/agents/agents')
      if (!res.ok) return []
      const data = await res.json()
      return data.agents || []
    },
    select: (agents: Array<{ id: string; name: string; role: string; status: string }>): AssignableAgent[] =>
      agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        status: (['idle', 'working', 'blocked'].includes(a.status) ? a.status : 'idle') as AssignableAgent['status'],
      })),
  })
}

/**
 * Single-select assignee combobox: one dropdown across every ARI account and
 * every agent, searchable, one assignee at a time. Selecting an agent also
 * records `assigned_agent_id` so the task shows up in that agent's queue.
 */
export function AssigneePicker({ value, onChange }: { value: AssigneeValue; onChange: (next: AssigneeValue) => void }) {
  const [open, setOpen] = useState(false)
  const { user: me } = useAuth()
  const { data: users = [] } = useAssignableUsers()
  const { data: agents = [] } = useAssignableAgents()

  // Current user first, everyone else alphabetical.
  const people = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.id === me?.id) return -1
      if (b.id === me?.id) return 1
      return a.name.localeCompare(b.name)
    })
  }, [users, me?.id])

  const selectedAgent = value.assigned_agent_id
    ? agents.find((a) => a.id === value.assigned_agent_id) ?? null
    : null
  const selectedName = value.assigned_agent_id
    ? selectedAgent?.name ?? 'Agent'
    : value.assignees[0] ?? null

  const pickUser = (u: AssignableUser) => {
    onChange({ assignees: [u.name], assigned_agent_id: null })
    setOpen(false)
  }
  // Only assigned_agent_id is stored for agents — the name is rendered live
  // from the agent record (AssignedAgentBadge), so copying it into assignees
  // would show the agent twice and go stale on rename.
  const pickAgent = (a: AssignableAgent) => {
    onChange({ assignees: [], assigned_agent_id: a.id })
    setOpen(false)
  }
  const clear = () => onChange({ assignees: [], assigned_agent_id: null })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('w-full justify-between font-normal', selectedName && 'pr-14')}
          >
            {selectedName ? (
              <span className="flex items-center gap-2 min-w-0">
                {value.assigned_agent_id ? (
                  <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{selectedName}</span>
                {selectedAgent && (
                  <span className="text-xs text-muted-foreground truncate">· {selectedAgent.role}</span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Assign to a person or agent…</span>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        {/* Sibling of the trigger, not a child — a button nested inside a
            button is invalid interactive markup that AT can't reach. */}
        {selectedName && (
          <button
            type="button"
            aria-label="Clear assignee"
            onClick={clear}
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search people and agents…" />
          <CommandList>
            <CommandEmpty>Nobody by that name.</CommandEmpty>
            <CommandGroup heading="People">
              {people.map((u) => (
                <CommandItem key={u.id} value={`person ${u.name} ${u.id}`} onSelect={() => pickUser(u)}>
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{u.name}</span>
                  {u.id === me?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                  <Check
                    className={cn(
                      'ml-auto h-4 w-4',
                      !value.assigned_agent_id && value.assignees[0] === u.name ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            {agents.length > 0 && (
              <CommandGroup heading="Agents">
                {agents.map((a) => (
                  <CommandItem key={a.id} value={`agent ${a.name} ${a.role} ${a.id}`} onSelect={() => pickAgent(a)}>
                    <span className="relative inline-flex">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <span
                        aria-hidden
                        className={cn(
                          'absolute -right-0.5 -bottom-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background',
                          agentStatusDotClass(a.status),
                        )}
                      />
                    </span>
                    <span className="truncate">{a.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{a.role}</span>
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        value.assigned_agent_id === a.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
