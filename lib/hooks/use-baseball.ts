import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { BaseballPlayer, BaseballTeam, CreatePlayerRequest, CreateTeamRequest, UpdatePlayerRequest, UpdateTeamRequest } from '@/modules-core/baseball/types'

const PLAYERS_KEY = ['baseball-players']
const TEAMS_KEY = ['baseball-teams']

// ---- Teams ----

export function useBaseballTeams() {
  return useQuery({
    queryKey: TEAMS_KEY,
    queryFn: async (): Promise<BaseballTeam[]> => {
      const res = await fetch('/api/modules/baseball/teams')
      if (!res.ok) throw new Error('Failed to fetch teams')
      const data = await res.json()
      return data.teams || []
    },
  })
}

export function useCreateBaseballTeam() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (team: CreateTeamRequest): Promise<BaseballTeam> => {
      const res = await fetch('/api/modules/baseball/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(team),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: any) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to create team')
      }
      const data = await res.json()
      return data.team
    },
    onMutate: async (newTeam) => {
      await queryClient.cancelQueries({ queryKey: TEAMS_KEY })
      const previous = queryClient.getQueryData<BaseballTeam[]>(TEAMS_KEY)

      queryClient.setQueryData<BaseballTeam[]>(TEAMS_KEY, (old = []) => [
        {
          id: 'temp-' + Date.now(),
          user_id: '',
          created_at: new Date().toISOString(),
          ...newTeam,
        } as BaseballTeam,
        ...old,
      ])

      return { previous }
    },
    onError: (_err, _newTeam, context) => {
      if (context?.previous) queryClient.setQueryData(TEAMS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TEAMS_KEY })
    },
  })
}

export function useUpdateBaseballTeam() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateTeamRequest & { id: string }): Promise<BaseballTeam> => {
      const res = await fetch(`/api/modules/baseball/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update team')
      const json = await res.json()
      return json.team
    },
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: TEAMS_KEY })
      const previous = queryClient.getQueryData<BaseballTeam[]>(TEAMS_KEY)

      queryClient.setQueryData<BaseballTeam[]>(TEAMS_KEY, (old = []) =>
        old.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
      )

      return { previous }
    },
    onError: (_err, _updated, context) => {
      if (context?.previous) queryClient.setQueryData(TEAMS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TEAMS_KEY })
      queryClient.invalidateQueries({ queryKey: PLAYERS_KEY })
    },
  })
}

export function useDeleteBaseballTeam() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/baseball/teams?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete team')
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: TEAMS_KEY })
      const previous = queryClient.getQueryData<BaseballTeam[]>(TEAMS_KEY)

      queryClient.setQueryData<BaseballTeam[]>(TEAMS_KEY, (old = []) =>
        old.filter((t) => t.id !== deletedId)
      )

      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(TEAMS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TEAMS_KEY })
    },
  })
}

// ---- Players ----

export function useBaseballPlayers() {
  return useQuery({
    queryKey: PLAYERS_KEY,
    queryFn: async (): Promise<BaseballPlayer[]> => {
      const res = await fetch('/api/modules/baseball/players')
      if (!res.ok) throw new Error('Failed to fetch players')
      const data = await res.json()
      return data.players || []
    },
  })
}

export function useCreateBaseballPlayer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (player: CreatePlayerRequest): Promise<BaseballPlayer> => {
      const res = await fetch('/api/modules/baseball/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(player),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const details = err.details?.map((d: any) => d.message).join(', ')
        throw new Error(details || err.error || 'Failed to create player')
      }
      const data = await res.json()
      return data.player
    },
    onMutate: async (newPlayer) => {
      await queryClient.cancelQueries({ queryKey: PLAYERS_KEY })
      const previous = queryClient.getQueryData<BaseballPlayer[]>(PLAYERS_KEY)

      queryClient.setQueryData<BaseballPlayer[]>(PLAYERS_KEY, (old = []) => [
        {
          id: 'temp-' + Date.now(),
          user_id: '',
          team_id: newPlayer.team_id ?? null,
          first_name: newPlayer.first_name,
          last_name: newPlayer.last_name,
          position: newPlayer.position,
          jersey_number: newPlayer.jersey_number ?? null,
          games: newPlayer.games ?? 0,
          at_bats: newPlayer.at_bats ?? 0,
          hits: newPlayer.hits ?? 0,
          home_runs: newPlayer.home_runs ?? 0,
          rbi: newPlayer.rbi ?? 0,
          batting_avg: newPlayer.batting_avg ?? 0,
          obp: newPlayer.obp ?? 0,
          slg: newPlayer.slg ?? 0,
          ops: newPlayer.ops ?? 0,
          created_at: new Date().toISOString(),
        } as BaseballPlayer,
        ...old,
      ])

      return { previous }
    },
    onError: (_err, _newPlayer, context) => {
      if (context?.previous) queryClient.setQueryData(PLAYERS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PLAYERS_KEY })
    },
  })
}

export function useUpdateBaseballPlayer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdatePlayerRequest & { id: string }): Promise<BaseballPlayer> => {
      const res = await fetch(`/api/modules/baseball/players/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update player')
      const json = await res.json()
      return json.player
    },
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: PLAYERS_KEY })
      const previous = queryClient.getQueryData<BaseballPlayer[]>(PLAYERS_KEY)

      queryClient.setQueryData<BaseballPlayer[]>(PLAYERS_KEY, (old = []) =>
        old.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      )

      return { previous }
    },
    onError: (_err, _updated, context) => {
      if (context?.previous) queryClient.setQueryData(PLAYERS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PLAYERS_KEY })
    },
  })
}

export function useDeleteBaseballPlayer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/modules/baseball/players?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete player')
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: PLAYERS_KEY })
      const previous = queryClient.getQueryData<BaseballPlayer[]>(PLAYERS_KEY)

      queryClient.setQueryData<BaseballPlayer[]>(PLAYERS_KEY, (old = []) =>
        old.filter((p) => p.id !== deletedId)
      )

      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(PLAYERS_KEY, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PLAYERS_KEY })
    },
  })
}
