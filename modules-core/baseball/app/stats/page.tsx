'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, BarChart3, ArrowUpDown } from 'lucide-react'
import { useBaseballPlayers } from '@/lib/hooks/use-baseball'
import type { BaseballPlayer } from '../../types'

type SortField = 'batting_avg' | 'home_runs' | 'rbi' | 'hits' | 'obp' | 'slg' | 'ops' | 'games' | 'at_bats'

const STAT_COLUMNS: { key: SortField; label: string; format?: (v: number) => string }[] = [
  { key: 'batting_avg', label: 'AVG', format: (v) => v.toFixed(3) },
  { key: 'home_runs', label: 'HR' },
  { key: 'rbi', label: 'RBI' },
  { key: 'hits', label: 'H' },
  { key: 'obp', label: 'OBP', format: (v) => v.toFixed(3) },
  { key: 'slg', label: 'SLG', format: (v) => v.toFixed(3) },
  { key: 'ops', label: 'OPS', format: (v) => v.toFixed(3) },
  { key: 'games', label: 'G' },
  { key: 'at_bats', label: 'AB' },
]

export default function BaseballStatsPage() {
  const { data: players = [], isLoading } = useBaseballPlayers()
  const [sortBy, setSortBy] = useState<SortField>('batting_avg')

  const sorted = [...players].sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-medium">Stats</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {STAT_COLUMNS.map((col) => (
          <Button
            key={col.key}
            variant={sortBy === col.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy(col.key)}
          >
            {col.label}
            {sortBy === col.key && <ArrowUpDown className="w-3 h-3 ml-1" />}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
          <CardDescription>
            Sorted by {STAT_COLUMNS.find((c) => c.key === sortBy)?.label} (descending)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : players.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No players to display. Add players first!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium w-8">#</th>
                    <th className="pb-2 pr-4 font-medium">Player</th>
                    <th className="pb-2 pr-4 font-medium">Team</th>
                    {STAT_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`pb-2 pr-4 font-medium text-right cursor-pointer hover:text-foreground ${
                          sortBy === col.key ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                        onClick={() => setSortBy(col.key)}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((player, i) => (
                    <tr key={player.id} className="border-b last:border-0 hover:bg-accent/50 transition-colors">
                      <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium">{player.first_name} {player.last_name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{player.team_name || '—'}</td>
                      {STAT_COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={`py-2 pr-4 text-right ${sortBy === col.key ? 'font-semibold' : ''}`}
                        >
                          {col.format ? col.format(player[col.key] ?? 0) : (player[col.key] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
