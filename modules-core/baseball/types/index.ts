export interface BaseballTeam {
  id: string
  user_id: string
  name: string
  city: string
  league: string
  division: string
  created_at: string
  updated_at?: string
}

export interface BaseballPlayer {
  id: string
  user_id: string
  team_id: string | null
  first_name: string
  last_name: string
  position: string
  jersey_number: number | null
  games: number
  at_bats: number
  hits: number
  home_runs: number
  rbi: number
  batting_avg: number
  obp: number
  slg: number
  ops: number
  created_at: string
  updated_at?: string
  team_name?: string
}

export interface CreateTeamRequest {
  name: string
  city: string
  league: string
  division: string
}

export interface CreatePlayerRequest {
  first_name: string
  last_name: string
  team_id?: string | null
  position: string
  jersey_number?: number | null
  games?: number
  at_bats?: number
  hits?: number
  home_runs?: number
  rbi?: number
  batting_avg?: number
  obp?: number
  slg?: number
  ops?: number
}

export interface UpdatePlayerRequest extends Partial<CreatePlayerRequest> {}
export interface UpdateTeamRequest extends Partial<CreateTeamRequest> {}
