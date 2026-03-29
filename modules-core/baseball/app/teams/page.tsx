'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Loader2, Plus, Trash2, Pencil, Shield } from 'lucide-react'
import {
  useBaseballTeams,
  useCreateBaseballTeam,
  useUpdateBaseballTeam,
  useDeleteBaseballTeam,
} from '@/modules/baseball/hooks/use-baseball'
import type { BaseballTeam, CreateTeamRequest } from '../../types'

const LEAGUES = ['AL', 'NL']
const DIVISIONS = ['East', 'Central', 'West']

const emptyForm: CreateTeamRequest = {
  name: '',
  city: '',
  league: '',
  division: '',
}

type FieldErrors = Record<string, string>

function validateTeamForm(form: CreateTeamRequest): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.name.trim()) errors.name = 'Team name is required'
  if (!form.city.trim()) errors.city = 'City is required'
  if (!form.league) errors.league = 'League is required'
  if (!form.division) errors.division = 'Division is required'
  return errors
}

export default function BaseballTeamsPage() {
  const { toast } = useToast()
  const { data: teams = [], isLoading } = useBaseballTeams()
  const createTeam = useCreateBaseballTeam()
  const updateTeam = useUpdateBaseballTeam()
  const deleteTeam = useDeleteBaseballTeam()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateTeamRequest>(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setErrors({})
    setDialogOpen(true)
  }

  const openEdit = (team: BaseballTeam) => {
    setEditingId(team.id)
    setForm({
      name: team.name,
      city: team.city,
      league: team.league,
      division: team.division,
    })
    setErrors({})
    setDialogOpen(true)
  }

  const handleSave = () => {
    const fieldErrors = validateTeamForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    if (editingId) {
      updateTeam.mutate(
        { id: editingId, ...form },
        {
          onSuccess: () => setDialogOpen(false),
          onError: (err) => toast({ variant: 'destructive', title: 'Failed to update team', description: err.message }),
        }
      )
    } else {
      createTeam.mutate(form, {
        onSuccess: () => setDialogOpen(false),
        onError: (err) => toast({ variant: 'destructive', title: 'Failed to create team', description: err.message }),
      })
    }
  }

  const handleDelete = (id: string) => {
    deleteTeam.mutate(id, {
      onError: () => toast({ variant: 'destructive', title: 'Failed to delete team' }),
    })
  }

  const updateField = (field: keyof CreateTeamRequest, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next })
  }

  const inputClass = (field: string) =>
    errors[field] ? 'border-red-500 focus-visible:ring-red-500' : ''

  const selectTriggerClass = (field: string) =>
    errors[field] ? 'border-red-500 ring-red-500' : ''

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-medium">Teams</h1>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Team
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Teams</CardTitle>
          <CardDescription>{teams.length} team{teams.length !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No teams yet. Add one to get started!</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{team.city} {team.name}</p>
                    <p className="text-sm text-muted-foreground">{team.league} {team.division}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(team)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(team.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Team' : 'Add Team'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>City *</Label>
                <Input className={inputClass('city')} value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="New York" />
                {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
              </div>
              <div className="space-y-2">
                <Label>Team Name *</Label>
                <Input className={inputClass('name')} value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Yankees" />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>League *</Label>
                <Select value={form.league} onValueChange={(v) => updateField('league', v)}>
                  <SelectTrigger className={selectTriggerClass('league')}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {LEAGUES.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.league && <p className="text-xs text-red-500">{errors.league}</p>}
              </div>
              <div className="space-y-2">
                <Label>Division *</Label>
                <Select value={form.division} onValueChange={(v) => updateField('division', v)}>
                  <SelectTrigger className={selectTriggerClass('division')}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {DIVISIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.division && <p className="text-xs text-red-500">{errors.division}</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createTeam.isPending || updateTeam.isPending}>
              {(createTeam.isPending || updateTeam.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingId ? 'Save Changes' : 'Add Team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
