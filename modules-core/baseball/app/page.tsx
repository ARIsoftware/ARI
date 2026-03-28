'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Loader2, Plus, Trash2, Pencil, Users } from 'lucide-react'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import {
  useBaseballPlayers,
  useBaseballTeams,
  useCreateBaseballPlayer,
  useUpdateBaseballPlayer,
  useDeleteBaseballPlayer,
} from '@/lib/hooks/use-baseball'
import type { BaseballPlayer, CreatePlayerRequest } from '../types'

const POSITIONS = ['C', 'P', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'OF', 'IF', 'UT']

const emptyForm: CreatePlayerRequest = {
  first_name: '',
  last_name: '',
  team_id: null,
  position: '',
  jersey_number: null,
  games: 0,
  at_bats: 0,
  hits: 0,
  home_runs: 0,
  rbi: 0,
  batting_avg: 0,
  obp: 0,
  slg: 0,
  ops: 0,
}

type FieldErrors = Record<string, string>

function validatePlayerForm(form: CreatePlayerRequest): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.first_name.trim()) errors.first_name = 'First name is required'
  if (!form.last_name.trim()) errors.last_name = 'Last name is required'
  if (!form.position) errors.position = 'Position is required'
  if (form.jersey_number != null && (form.jersey_number < 0 || form.jersey_number > 99)) errors.jersey_number = 'Must be 0-99'
  if (form.games < 0) errors.games = 'Must be 0 or more'
  if (form.at_bats < 0) errors.at_bats = 'Must be 0 or more'
  if (form.hits < 0) errors.hits = 'Must be 0 or more'
  if (form.home_runs < 0) errors.home_runs = 'Must be 0 or more'
  if (form.rbi < 0) errors.rbi = 'Must be 0 or more'
  if (form.batting_avg < 0 || form.batting_avg > 1) errors.batting_avg = 'Must be 0-1.000'
  if (form.obp < 0 || form.obp > 1) errors.obp = 'Must be 0-1.000'
  if (form.slg < 0 || form.slg > 4) errors.slg = 'Must be 0-4.000'
  if (form.ops < 0 || form.ops > 5) errors.ops = 'Must be 0-5.000'
  return errors
}

export default function BaseballPlayersPage() {
  const { toast } = useToast()
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')
  const { data: players = [], isLoading } = useBaseballPlayers()
  const { data: teams = [] } = useBaseballTeams()
  const createPlayer = useCreateBaseballPlayer()
  const updatePlayer = useUpdateBaseballPlayer()
  const deletePlayer = useDeleteBaseballPlayer()

  const [randomQuote, setRandomQuote] = useState<{ quote: string; author?: string } | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CreatePlayerRequest>(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})

  // Load random quote when quotes module is enabled
  useEffect(() => {
    if (!quotesEnabled || quotesLoading) return
    let cancelled = false
    fetch('/api/modules/quotes/quotes')
      .then((res) => (res.ok ? res.json() : []))
      .then((quotes) => {
        if (!cancelled && quotes.length > 0) {
          setRandomQuote(quotes[Math.floor(Math.random() * quotes.length)])
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [quotesEnabled, quotesLoading])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setErrors({})
    setDialogOpen(true)
  }

  const openEdit = (player: BaseballPlayer) => {
    setEditingId(player.id)
    setForm({
      first_name: player.first_name,
      last_name: player.last_name,
      team_id: player.team_id,
      position: player.position,
      jersey_number: player.jersey_number,
      games: player.games,
      at_bats: player.at_bats,
      hits: player.hits,
      home_runs: player.home_runs,
      rbi: player.rbi,
      batting_avg: Number(player.batting_avg),
      obp: Number(player.obp),
      slg: Number(player.slg),
      ops: Number(player.ops),
    })
    setErrors({})
    setDialogOpen(true)
  }

  const handleSave = () => {
    const fieldErrors = validatePlayerForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    if (editingId) {
      updatePlayer.mutate(
        { id: editingId, ...form },
        {
          onSuccess: () => setDialogOpen(false),
          onError: (err) => toast({ variant: 'destructive', title: 'Failed to update player', description: err.message }),
        }
      )
    } else {
      createPlayer.mutate(form, {
        onSuccess: () => setDialogOpen(false),
        onError: (err) => toast({ variant: 'destructive', title: 'Failed to create player', description: err.message }),
      })
    }
  }

  const handleDelete = (id: string) => {
    deletePlayer.mutate(id, {
      onError: () => toast({ variant: 'destructive', title: 'Failed to delete player' }),
    })
  }

  const updateField = (field: keyof CreatePlayerRequest, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next })
  }

  const inputClass = (field: string) =>
    errors[field] ? 'border-red-500 focus-visible:ring-red-500' : ''

  const selectTriggerClass = (field: string) =>
    errors[field] ? 'border-red-500 ring-red-500' : ''

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-medium">Players</h1>
          {quotesEnabled && randomQuote && (
            <p className="text-sm text-[#aa2020] mt-1">
              {randomQuote.quote}
            </p>
          )}
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Player
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>{players.length} player{players.length !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : players.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No players yet. Add one to get started!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Team</th>
                    <th className="pb-2 pr-4 font-medium">Pos</th>
                    <th className="pb-2 pr-4 font-medium text-right">#</th>
                    <th className="pb-2 pr-4 font-medium text-right">G</th>
                    <th className="pb-2 pr-4 font-medium text-right">AB</th>
                    <th className="pb-2 pr-4 font-medium text-right">H</th>
                    <th className="pb-2 pr-4 font-medium text-right">HR</th>
                    <th className="pb-2 pr-4 font-medium text-right">RBI</th>
                    <th className="pb-2 pr-4 font-medium text-right">AVG</th>
                    <th className="pb-2 pr-4 font-medium text-right">OBP</th>
                    <th className="pb-2 pr-4 font-medium text-right">SLG</th>
                    <th className="pb-2 pr-4 font-medium text-right">OPS</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr key={player.id} className="border-b last:border-0 hover:bg-accent/50 transition-colors">
                      <td className="py-2 pr-4 font-medium">{player.first_name} {player.last_name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{player.team_name || '—'}</td>
                      <td className="py-2 pr-4">{player.position}</td>
                      <td className="py-2 pr-4 text-right">{player.jersey_number ?? '—'}</td>
                      <td className="py-2 pr-4 text-right">{player.games}</td>
                      <td className="py-2 pr-4 text-right">{player.at_bats}</td>
                      <td className="py-2 pr-4 text-right">{player.hits}</td>
                      <td className="py-2 pr-4 text-right">{player.home_runs}</td>
                      <td className="py-2 pr-4 text-right">{player.rbi}</td>
                      <td className="py-2 pr-4 text-right">{player.batting_avg.toFixed(3)}</td>
                      <td className="py-2 pr-4 text-right">{player.obp.toFixed(3)}</td>
                      <td className="py-2 pr-4 text-right">{player.slg.toFixed(3)}</td>
                      <td className="py-2 pr-4 text-right">{player.ops.toFixed(3)}</td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(player)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(player.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Player' : 'Add Player'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input className={inputClass('first_name')} value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} />
                {errors.first_name && <p className="text-xs text-red-500">{errors.first_name}</p>}
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input className={inputClass('last_name')} value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} />
                {errors.last_name && <p className="text-xs text-red-500">{errors.last_name}</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Position *</Label>
                <Select value={form.position} onValueChange={(v) => updateField('position', v)}>
                  <SelectTrigger className={selectTriggerClass('position')}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {POSITIONS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.position && <p className="text-xs text-red-500">{errors.position}</p>}
              </div>
              <div className="space-y-2">
                <Label>Team</Label>
                <Select value={form.team_id || 'none'} onValueChange={(v) => updateField('team_id', v === 'none' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Team</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jersey #</Label>
                <Input
                  className={inputClass('jersey_number')}
                  type="number"
                  min={0}
                  max={99}
                  value={form.jersey_number ?? ''}
                  onChange={(e) => updateField('jersey_number', e.target.value ? Number(e.target.value) : null)}
                />
                {errors.jersey_number && <p className="text-xs text-red-500">{errors.jersey_number}</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Games</Label>
                <Input className={inputClass('games')} type="number" min={0} value={form.games} onChange={(e) => updateField('games', Number(e.target.value))} />
                {errors.games && <p className="text-xs text-red-500">{errors.games}</p>}
              </div>
              <div className="space-y-2">
                <Label>At Bats</Label>
                <Input className={inputClass('at_bats')} type="number" min={0} value={form.at_bats} onChange={(e) => updateField('at_bats', Number(e.target.value))} />
                {errors.at_bats && <p className="text-xs text-red-500">{errors.at_bats}</p>}
              </div>
              <div className="space-y-2">
                <Label>Hits</Label>
                <Input className={inputClass('hits')} type="number" min={0} value={form.hits} onChange={(e) => updateField('hits', Number(e.target.value))} />
                {errors.hits && <p className="text-xs text-red-500">{errors.hits}</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Home Runs</Label>
                <Input className={inputClass('home_runs')} type="number" min={0} value={form.home_runs} onChange={(e) => updateField('home_runs', Number(e.target.value))} />
                {errors.home_runs && <p className="text-xs text-red-500">{errors.home_runs}</p>}
              </div>
              <div className="space-y-2">
                <Label>RBI</Label>
                <Input className={inputClass('rbi')} type="number" min={0} value={form.rbi} onChange={(e) => updateField('rbi', Number(e.target.value))} />
                {errors.rbi && <p className="text-xs text-red-500">{errors.rbi}</p>}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>AVG</Label>
                <Input className={inputClass('batting_avg')} type="number" step="0.001" min={0} max={1} value={form.batting_avg} onChange={(e) => updateField('batting_avg', Number(e.target.value))} />
                {errors.batting_avg && <p className="text-xs text-red-500">{errors.batting_avg}</p>}
              </div>
              <div className="space-y-2">
                <Label>OBP</Label>
                <Input className={inputClass('obp')} type="number" step="0.001" min={0} max={1} value={form.obp} onChange={(e) => updateField('obp', Number(e.target.value))} />
                {errors.obp && <p className="text-xs text-red-500">{errors.obp}</p>}
              </div>
              <div className="space-y-2">
                <Label>SLG</Label>
                <Input className={inputClass('slg')} type="number" step="0.001" min={0} max={4} value={form.slg} onChange={(e) => updateField('slg', Number(e.target.value))} />
                {errors.slg && <p className="text-xs text-red-500">{errors.slg}</p>}
              </div>
              <div className="space-y-2">
                <Label>OPS</Label>
                <Input className={inputClass('ops')} type="number" step="0.001" min={0} max={5} value={form.ops} onChange={(e) => updateField('ops', Number(e.target.value))} />
                {errors.ops && <p className="text-xs text-red-500">{errors.ops}</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createPlayer.isPending || updatePlayer.isPending}>
              {(createPlayer.isPending || updatePlayer.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingId ? 'Save Changes' : 'Add Player'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
