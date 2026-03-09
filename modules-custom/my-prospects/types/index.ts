export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
export type Position = (typeof POSITIONS)[number]

export interface Prospect {
  id: string
  user_id: string
  name: string
  position: string
  graduation_year: number
  school: string
  height: string
  rating: number
  notes: string | null
  evaluated_at: string
  created_at: string
  updated_at: string
}

export interface CreateProspectRequest {
  name: string
  position: string
  graduation_year: number
  school: string
  height: string
  rating: number
  notes?: string
}

export interface UpdateProspectRequest extends Partial<CreateProspectRequest> {}

export interface ProspectSettings {
  showInDashboard: boolean
}
